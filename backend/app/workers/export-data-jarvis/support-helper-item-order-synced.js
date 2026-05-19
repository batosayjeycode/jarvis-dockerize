'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const SES = require('sociolla-core/lib/aws/ses');
const { Readable } = require('stream');
const moment = require('moment');
const CommonHelper = require('../../helpers/commonHelper');
const Logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-support-helper-item-order-synced' });
const workerHelpers = require('../../helpers/workerHelper');

const fieldName = {
	'MongoID of Order Reference Friday': 'id_order',
	'MongoID of Order Lines Friday': 'mongo_id_item',
	'Order Reff': 'order_reff',
	'Order Date': 'order_date',
	'Business Unit': 'business_unit',
	'Cerebro Business Unit': 'business_unit_cerebro',
	'Order Type': 'order_type',
	Platform: 'order_platform',
	Store: 'store',
	SKU: 'sku',
	'Sales Team': 'sales_team',
	'Delivered Qty on Friday': 'delivered_qty_friday',
	'Returned Qty on Friday': 'returned_qty_friday',
	'Net Delivered Qty on Cerebro': 'delivered_qty_cerebro',
	'Returned Qty on Cerebro': 'returned_qty_cerebro',
	'Different Qty Delivered': 'different_qty_delivered',
	'Different Qty Returned': 'different_qty_returned',
	'Sync Status': 'sync_status',
	Status: 'status',
	'Partial Refund Status': 'partial_refund_state',
	'Last Updated On Jarvis': 'last_updated_on_jarvis',
};
class SupportHelperItemOrderSynced extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-support-helper-item-order-synced');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		}).then((result) => {
			const total = parseInt(result.rows[0].total);
			Logger.info(`Total count: ${total} by ${this.options.context?.user?.email} to ${this.options.email}`);
			this.options.totalCount = total;
			return total;
		});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			Logger.info(
				`Querying LIMIT ${limit} OFFSET ${offset} by ${this.options.context?.user?.email} to ${this.options.email}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				Logger.info(
					`Start insert CSV Processed ${limit} OFFSET ${offset} by ${this.options.context?.user?.email} to ${this.options.email}`,
				);
				for (const row of rows) {
					const data = Object.entries(fieldName).reduce((acc, el) => {
						if (['order_date_ori', 'last_updated_on_jarvis'].includes(el[1])) {
							row[el[1]] = row[el[1]] ? moment(new Date(row[el[1]])).format('YYYY-MM-DD HH:mm:ss') : null;
						}
						if (el[1] === 'order_date') {
							row[el[1]] = row[el[1]] ? moment(new Date(row[el[1]])).format('YYYY-MM-DD') : null;
						}
						if (el[1] === 'business_unit') {
							row[el[1]] = CommonHelper.getBusinessUnitAlias(row[el[1]]);
						}
						if (['store', 'business_unit_cerebro', 'status', 'partial_refund_state'].includes(el[1])) {
							row[el[1]] = row[el[1]] || '-';
						}
						acc[el[0]] = row[el[1]] || 0;
						return acc;
					}, {});
					self.options.csv.push(data);
				}
			})
			.then(() => {
				Logger.info(
					`Done Processed ${limit} OFFSET ${offset} of ${this.options.totalCount} by ${this.options.context?.user?.email} to ${this.options.email}`,
				);
			})
			.catch((err) => {
				Logger.error(err);
				throw err;
			});
	}
}

module.exports = (message) => {
	const criteria = message.data.criteria;
	const context = message.data.context;
	const isValidEmail = workerHelpers.checkValidEmail(criteria.send_to_email);
	if (!isValidEmail) {
		Logger.error(
			`[${context?.user?.name} - ${context?.user?.email}] Email to '${criteria.send_to_email}' is not valid!`,
		);
		return;
	}
	const client = message.client;
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};

	const tmpTable = `tmp.support_helper_item_order_synced_${~~(Date.now() / 1000)}`;
	const tmpTableCreateTable = `CREATE UNLOGGED TABLE IF NOT EXISTS ${tmpTable} AS (SELECT * FROM (${criteria.queryRow}) as tmp)`;

	return Q.try(() => {
		Logger.info(`CREATE UNLOGGED TABLE IF NOT EXISTS ${tmpTable}`);
		return client.connectDwh.query(tmpTableCreateTable);
	})
		.then((result) => {
			const totalRows = result.rowCount || 0;
			if (!totalRows) {
				Logger.info(`Result is empty, DROP TABLE ${tmpTable}`);
				return client.connectDwh.query(`DROP TABLE ${tmpTable}`);
			} else {
				Logger.info(`Total result is ${totalRows}`);
				const queryRow = `SELECT * FROM ${tmpTable} ORDER BY id_order`;
				const queryCount = `SELECT COUNT(*) as total FROM ${tmpTable}`;

				const outputFile = file_name;
				const fields = Object.keys(fieldName);
				const json2csv = new Transform({ fields }, { objectMode: true });
				const output = fs.createWriteStream(outputFile, { flags: 'a' });
				const input = new Readable({ objectMode: true });
				input._read = () => {};
				input.pipe(json2csv).pipe(output);
				const task = new SupportHelperItemOrderSynced({
					limit: 500,
					offset: 0,
					queryCount,
					queryRow,
					context,
					client,
					email: criteria.send_to_email,
					filename: criteria.filename,
					file_name,
					csv: input,
					document,
					totalCount: 0,
					stopOnError: true,
					rejectOnError: true,
				});
				return task
					.execute()
					.then(() => {
						input.push(null);
						return new Promise((resolve, reject) => {
							output.on('finish', () => resolve());
							output.on('error', (error) => reject(error));
						});
					})
					.then(() => {
						Logger.info(`Process database is done, DROP TABLE ${tmpTable}`);
						return client.connectDwh.query(`DROP TABLE ${tmpTable}`);
					})
					.then(() => {
						return S3.upload({
							path: process.env.JARVIS_S3_PATH,
							fileName: outputFile,
							fileData: fs.createReadStream(outputFile),
							contentType: 'text/csv',
							isReplaceFile: true,
						});
					})
					.then((res) => {
						const cdnUrl = res.cdn_url ? res.cdn_url : res.url;
						return SES.sendEmail(
							{
								to: criteria.send_to_email,
								from: process.env.SES_GMAIL_MAIL_JARVIS,
								sparkPostOption: { options: { click_tracking: false } },
								subject: 'Export Item Order Synced',
								html: `<a href="${cdnUrl}" rel="notrack">Download Here</a>`,
							},
							'mail_jet',
							true,
						);
					})
					.then(() => {
						Logger.info(`Email sent, by ${context?.user?.email} to ${criteria.send_to_email}`);
					})
					.finally(() => {
						fs.rmSync(outputFile, { force: true });
					})
					.catch((err) => {
						Logger.error(err);
						throw err;
					});
			}
		})
		.catch((err) => {
			Logger.error(err);
			throw err;
		});
};
