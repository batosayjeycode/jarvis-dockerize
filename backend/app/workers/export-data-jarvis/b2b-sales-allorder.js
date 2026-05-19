'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment-timezone');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'b2b-sales-allorder' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2BSalesAllorder extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2b-sales-allorder');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
				);
				return parseInt(result.rows[0].total);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const type = this.options.type;
				const rows = result.rows || [];
				for (const row of rows) {
					const obj = {};
					obj['Order Date'] = moment(new Date(row.order_date))
						.tz('Asia/Jakarta')
						.format('DD/MM/YYYY HH:mm:ss');
					obj['Shipped Date'] = row.shipped_date;
					obj['Invoice Date'] = row.invoice_date;
					obj['Id Order'] = row.id_order || '';
					obj['Order Ref'] = row.order_ref || '';
					obj['Payment Term'] = row.payment_term || '';

					if (type == 'by_group1' || type == 'by_group2' || type == 'by_group3') {
						obj['Group Level'] = row.group_level || '';
						obj['Manufacturer ID'] = row.manufacturer_id || '';
						obj['Manufacturer'] = row.manufacturer || '';
					} else {
						obj['Customer Id'] = row.customer_id || '';
						obj['Customer Name'] = row.customer_name || '';
						obj['City'] = row.city || '';
						obj['Province'] = row.province_name || '';
						obj['Channel'] = row.channel_name || '';
						obj['Type'] = row.type_name || '';
						obj['Account'] = row.account_name || '';
					}

					obj['Total Paid'] = row.total_paid || '';
					obj['Total Discounts'] = row.total_discounts || '';
					obj['Invoice Status'] = row.invoice_status || '';
					obj['Sales Team'] = row.sales_team || '';
					obj['Sales Person'] = row.sales_person || '';

					self.options.csv.push(obj);
				}
			})
			.then(() => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Done ${
						limit + offset
					}`,
				);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
}

module.exports = async (message) => {
	const criteria = message.data.criteria;
	const context = message.data.context;
	const isValidEmail = workerHelpers.checkValidEmail(criteria.send_to_email);
	if (!isValidEmail) {
		logger.error(
			`[${context?.user?.name} - ${context?.user?.email}] Email to '${criteria.send_to_email}' is not valid!`,
		);
		return;
	}
	const client = message.client;
	const clientJarvis = message.clientJarvis;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2b-sales-allorder`);

	const outputFile = file_name;
	const type = document.view_point;
	let fields = [];
	if (type == 'by_group1' || type == 'by_group2' || type == 'by_group3') {
		fields = [
			'Order Date',
			'Id Order',
			'Order Ref',
			'Payment Term',
			'Group Level',
			'Manufacturer ID',
			'Manufacturer',
			'Total Paid',
			'Total Discounts',
			'Invoice Status',
			'Sales Team',
			'Sales Person',
		];
	} else {
		fields = [
			'Order Date',
			'Shipped Date',
			'Invoice Date',
			'Id Order',
			'Order Ref',
			'Payment Term',
			'Customer Id',
			'Customer Name',
			'City',
			'Province',
			'Channel',
			'Type',
			'Account',
			'Total Paid',
			'Total Discounts',
			'Invoice Status',
			'Sales Team',
			'Sales Person',
		];
	}
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2BSalesAllorder({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		type,
		document,
		stopOnError: true,
		rejectOnError: true,
	});

	try {
		await task.execute();
		await workerHelpers.sendmail({
			input,
			output,
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Export B2B Sales All Order',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
