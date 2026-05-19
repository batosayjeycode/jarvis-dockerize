/**
 * @author Dikdik Kusdinar
 **/
'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2b-customer-purchase-trend' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2BCustomerPurchaseTrend extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2b-customer-purchase-trend');
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
				const rows = result.rows || [];
				for (const row of rows) {
					const obj = {};
					if (this.options.type === 'by_product') {
						obj['Customer ID'] = row.id_customer;
						obj['Customer Name'] = row.customer_name;
						obj['Sales Area'] = row.sales_area;
						obj['Registered Since'] = row.registered_since;
						obj['Product ID'] = row.id_product;
						obj['Product Ref'] = row.product_ref;
						obj['Manufacturer'] = row.manufacturer;
						obj['Product Name'] = row.product_name;
						obj['Product Attribute'] = row.product_attribute;
					} else if (this.options.type === 'by_brand') {
						obj['Customer ID'] = row.id_customer;
						obj['Customer Name'] = row.customer_name;
						obj['Sales Area'] = row.sales_area;
						obj['Registered Since'] = row.registered_since;
						obj['Manufacturer'] = row.manufacturer;
					} else if (
						this.options.type == 'by_group1' ||
						this.options.type == 'by_group2' ||
						this.options.type == 'by_group3'
					) {
						obj['Group Level'] = row.group_level;
						obj['Manufacturer'] = row.manufacturer;
					} else {
						obj['Customer Name'] = row.customer_name;
						obj['Sales Area'] = row.sales_area;
						obj['Registered Since'] = row.registered_since;
					}
					obj['Qty'] = row.ordered_qty;
					obj['Value'] = row.total_price;
					(this.options.document.period_list || []).forEach((period) => {
						obj['Qty ' + period.value] = row[`ordered_qty_${period.key}`];
						obj['Value ' + period.value] = row[`total_price_${period.key}`];
					});
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
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2b-customer-purchase-trend`);
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Filter View Point : ${
			document?.view_point || 'by_general'
		}`,
	);

	const outputFile = file_name;
	let fields = [];
	const type = document.view_point || 'by_general';

	if (type === 'by_product') {
		fields = [
			'Customer ID',
			'Customer Name',
			'Sales Area',
			'Registered Since',
			'Product ID',
			'Product Ref',
			'Manufacturer',
			'Product Name',
			'Product Attribute',
			'Qty',
			'Value',
		];
	} else if (type === 'by_brand') {
		fields = ['Customer ID', 'Customer Name', 'Sales Area', 'Registered Since', 'Manufacturer', 'Qty', 'Value'];
	} else if (type == 'by_group1' || type == 'by_group2' || type == 'by_group3') {
		fields = ['Group Level', 'Manufacturer', 'Qty', 'Value'];
	} else {
		fields = ['Customer ID', 'Customer Name', 'Sales Area', 'Registered Since', 'Qty', 'Value'];
	}

	(document.period_list || []).forEach((period) => {
		fields.push(`Qty ${period.value}`);
		fields.push(`Value ${period.value}`);
	});

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);

	const task = new ExportB2BCustomerPurchaseTrend({
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
			subject: 'Export B2B Customer Purchase Trend',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
