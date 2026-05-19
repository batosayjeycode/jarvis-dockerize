'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2b-customerpurchase' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2BCustomerpurchase extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2b-customerpurchase');
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
				const document = this.options.document;
				const rows = result.rows || [];
				for (const row of rows) {
					const obj = {};
					if (document.view_point === 'by_product') {
						obj['Customer ID'] = row.id_customer || '';
						obj['Customer Name'] = row.customer_name || '';
						obj['Sales Area'] = row.sales_area || '';
						obj['Registered Since'] = row.registered_since || '';
						obj['Product Ref'] = row.product_ref || '';
						obj['ID Odoo'] = row.id_product || '';
						obj['Brand'] = row.manufacturer || '';
						obj['Product Name'] = row.product_name || '';
						obj['Attribute'] = row.product_attribute || '';
					} else if (document.view_point === 'by_brand') {
						obj['Customer ID'] = row.id_customer || '';
						obj['Customer Name'] = row.customer_name || '';
						obj['Sales Area'] = row.sales_area || '';
						obj['Registered Since'] = row.registered_since || '';
						obj['Brand'] = row.manufacturer || '';
					} else if (document.view_point === 'by_group1') {
						obj['Channel'] = row.group_level;
						obj['Brand'] = row.manufacturer || '';
					} else if (document.view_point === 'by_group2') {
						obj['Type'] = row.group_level;
						obj['Brand'] = row.manufacturer || '';
					} else if (document.view_point === 'by_group3') {
						obj['Account'] = row.group_level;
						obj['Brand'] = row.manufacturer || '';
					} else if (document.view_point === 'by_parent_company') {
						obj['Parent ID'] = row.parent_id;
						obj['Parent Name'] = row.parent_name || '';
						obj['Sales Area'] = row.sales_area || '';
					} else {
						obj['Customer ID'] = row.id_customer || '';
						obj['Customer Name'] = row.customer_name || '';
						obj['Sales Area'] = row.sales_area || '';
						obj['Registered Since'] = row.registered_since
							? moment(new Date(row.registered_since)).format('DD/MM/YYYY HH:mm:ss')
							: '';
					}

					obj['Qty'] = row.ordered_qty || '';
					obj['Value'] = row.total_price || '';

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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2b-customerpurchase`);
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Filter View Point : ${
			document?.view_point || 'by_general'
		}`,
	);

	const outputFile = file_name;
	const fields = [];

	if (document.view_point === 'by_product') {
		fields.push('Customer ID');
		fields.push('Customer Name');
		fields.push('Sales Area');
		fields.push('Registered Since');
		fields.push('Product Ref');
		fields.push('ID Odoo');
		fields.push('Brand');
		fields.push('Product Name');
		fields.push('Attribute');
	} else if (document.view_point === 'by_brand') {
		fields.push('Customer ID');
		fields.push('Customer Name');
		fields.push('Sales Area');
		fields.push('Registered Since');
		fields.push('Brand');
	} else if (document.view_point === 'by_group1') {
		fields.push('Channel');
		fields.push('Brand');
	} else if (document.view_point === 'by_group2') {
		fields.push('Type');
		fields.push('Brand');
	} else if (document.view_point === 'by_group3') {
		fields.push('Account');
		fields.push('Brand');
	} else if (document.view_point === 'by_parent_company') {
		fields.push('Parent ID');
		fields.push('Parent Name');
		fields.push('Sales Area');
	} else {
		fields.push('Customer ID');
		fields.push('Customer Name');
		fields.push('Sales Area');
		fields.push('Registered Since');
	}

	fields.push('Qty');
	fields.push('Value');

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2BCustomerpurchase({
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
			subject: 'Export B2B Customer Purchase',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
