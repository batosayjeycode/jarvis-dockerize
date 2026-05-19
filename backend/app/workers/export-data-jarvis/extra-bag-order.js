'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-extra-bag-orders' });
const workerHelpers = require('../../helpers/workerHelper');

const fieldName = {
	'Customer Unique Id': 'customer_unique_id',
	'Order Date': 'order_date',
	'Id Order': 'id_order',
	Reference: 'reference',
	'Voucher Code': 'voucher_code',
	Payment: 'order_payment',
	Email: 'email',
	Province: 'province',
	City: 'city',
	'Total Paid': 'total_order_paid',
	'Before Discount': 'before_discount',
	'Total Voucher Amount': 'total_order_voucher',
	'Total Shipping': 'total_order_shipping',
	Status: 'order_state',
	'Is Manual Order': 'is_manual_order',
	Cashier: 'email_cashier',
	Platform: 'order_platform',
	'Store Name': 'store_name',
	'Shipped Date Ori': 'shipped_date_ori',
	'Delivered Date Ori': 'delivered_date_ori',
	'Id Product': 'id_product',
	'Product Reference': 'product_reference',
	'Product Name': 'product_name',
	'Id Product Attribute': 'id_product_attribute',
	'Product Attribute': 'product_attribute',
	Brand: 'brand',
	'Product Type': 'order_product_type',
	'Product Classification': 'product_classification',
	'Default Category': 'category_default',
	Qty: 'total_product_quantity',
	'Base Price': 'base_price',
	Value: 'total_product_original_price',
	'Is Offline Guest': 'is_offlinestore_guest',
	'Bill No': 'ref_bill_number',
	'BA Code': 'offlinestore_ba_code',
	'Refunded Amount': 'refunded_amount',
	'Refunded Quantity': 'refunded_quantity',
	'EDC Type': 'edc_type',
};

class ExtraBagOrders extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-extra-bag-orders');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		}).then((result) => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
			);
			return parseInt(result.rows[0].total);
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
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(fieldName).reduce((acc, el) => {
						if (['order_date', 'shipped_date_ori', 'delivered_date_ori'].includes(el[1])) {
							row[el[1]] = row[el[1]] ? moment(new Date(row[el[1]])).format('YYYY-MM-DD HH:mm:ss') : null;
						}
						acc[el[0]] = row[el[1]] || null;
						return acc;
					}, {});
					self.options.csv.push(data);
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
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis extra-bag-orders`);

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExtraBagOrders({
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
			subject: 'Export Extra Bag Orders',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
