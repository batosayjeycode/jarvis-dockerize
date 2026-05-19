'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-sales-masksubscription' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CSalesMaskSubscription extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-sales-masksubscription');
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
		const isMaskSubOrder = this.options.type == 'b2c-sales-masksubscription-order';
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					if (isMaskSubOrder) {
						self.options.csv.push({
							'Order Date': row.order_date,
							'Mask Reference Code': row.mask_reference_code,
							'Month Of Subscribe': row.month_of_subcription,
							'Customer Id': row.customer_id,
							'Order Shipped': row.order_shipped,
							'Package Name': row.package_name,
							'Total Paid': row.total_order_paid,
							'Is Mask Upgrade': row.is_mask_upgrade,
							'Order From': row.order_source,
							Status: row.order_state,
						});
					} else {
						self.options.csv.push({
							'Avg month of subscribe': row.avg_month_of_subscribe,
							'Login apps current month': row.login_apps_current_month,
							'Login apps prev month': row.login_apps_prev_month,
							'Month of subcription': row.month_of_subcription,
							'Package name': row.package_name,
							'Prev month': row.prev_month,
							'Prev month subscriber': row.prev_month_subscriber,
							'Prev month total subcription': row.prev_month_total_subcription,
							'Subcribe rate': row.subcribeRate,
							'Subcribe rate prev': row.subcribeRatePrev,
							'Total first order': row.total_first_order,
							'Total order value': row.total_order_value,
							'Total same customer': row.total_same_customer,
							'Total subcription': row.total_subcription,
						});
					}
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
	const type = message.data.type;
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
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2c-sales-masksubscription`);

	const outputFile = file_name;
	const isMaskSubOrder = type == 'b2c-sales-masksubscription-order';
	const fields = isMaskSubOrder
		? [
				'Order Date',
				'Mask Reference Code',
				'Month Of Subscribe',
				'Customer Id',
				'Order Shipped',
				'Package Name',
				'Total Paid',
				'Is Mask Upgrade',
				'Order From',
				'Status',
			]
		: [
				'Avg month of subscribe',
				'Login apps current month',
				'Login apps prev month',
				'Month of subcription',
				'Package name',
				'Prev month',
				'Prev month subscriber',
				'Prev month total subcription',
				'Subcribe rate',
				'Subcribe rate prev',
				'Total first order',
				'Total order value',
				'Total same customer',
				'Total subcription',
			];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CSalesMaskSubscription({
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
			subject: 'Export B2C Sales Mark Subscription',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
