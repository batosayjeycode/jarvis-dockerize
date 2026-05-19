'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment-timezone');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'sinclair-dashboard' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportSinclairDashboard extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-sinclair-dashboard');
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
				const rows = (result?.rows || []).map((row) => {
					row.ach = row.ach > 0 ? row.ach.toFixed(2) + '%' : '-';
					row.percent_returning_customer =
						row.percent_returning_customer > 0
							? parseFloat(row.percent_returning_customer).toFixed(2) + '%'
							: '-';
					row.new_user_contribution =
						row.new_user_contribution > 0 ? parseFloat(row.new_user_contribution).toFixed(2) + '%' : '-';
					row.cr = row.cr > 0 ? parseFloat(row.cr).toFixed(2) + '%' : '-';
					row.guest_percentage =
						row.guest_percentage > 0 ? parseFloat(row.guest_percentage).toFixed(2) + '%' : '0%';

					return row;
				});

				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (el[1] === 'opening_date') {
							acc[el[0]] = row[el[1]] ? moment(row[el[1]]).format('DD-MMMM-YYYY') : '';
						} else {
							acc[el[0]] = row[el[1]] || null;
						}
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis sinclair-dashboard`);

	let fieldName = {
		'Store Alias': 'store_alias',
		'Store Name': 'store_name',
		'Opening Date': 'opening_date',
		City: 'city',
		Province: 'province',
		Size: 'store_size',
		Sales: 'total_value',
		'Total Paid': 'total_order_paid',
		'Net Revenue': 'total_net_revenue',
		Target: 'target_sales',
		'% Ach': 'ach',
		'Sales per Sqm': 'sales_sqm',
		Order: 'total_order',
		'AOV Net': 'aov_net_revenue',
		'Cust Purchase': 'total_unique_customer',
		'New Cust Purchase': 'total_new_customer_sales',
		'% Returning Cust': 'percent_returning_customer',
		'Contribution from New User': 'new_user_contribution',
		'User Registered': 'registered_customer',
		Footfall: 'total_visitor',
		CR: 'cr',
		'% Guest': 'guest_percentage',
		'Revenue Staff': 'revenue_staff',
	};

	if (document.view_point === 'by_city') {
		fieldName = {
			City: 'city',
			'City Type': 'type',
			Province: 'province',
			Size: 'store_size',
			Sales: 'total_value',
			'Total Paid': 'total_order_paid',
			'Estimated Net Revenue': 'total_net_revenue',
			Target: 'target_sales',
			'% Ach': 'ach',
			'Sales per Sqm': 'sales_sqm',
			Order: 'total_order',
			'AOV Net': 'aov_net_revenue',
			'Cust Purchase': 'total_unique_customer',
			'New Cust Purchase': 'total_new_customer_sales',
			'% Returning Cust': 'percent_returning_customer',
			'Contribution from New User': 'new_user_contribution',
			'User Registered': 'registered_customer',
			Footfall: 'total_visitor',
			CR: 'cr',
			'% Guest': 'guest_percentage',
			'Revenue Staff': 'revenue_staff',
		};
	} else if (document.view_point === 'by_province') {
		fieldName = {
			Province: 'province',
			Size: 'store_size',
			Sales: 'total_value',
			'Total Paid': 'total_order_paid',
			'Estimated Net Revenue': 'total_net_revenue',
			Target: 'target_sales',
			'% Ach': 'ach',
			'Sales per Sqm': 'sales_sqm',
			Order: 'total_order',
			'AOV Net': 'aov_net_revenue',
			'Cust Purchase': 'total_unique_customer',
			'New Cust Purchase': 'total_new_customer_sales',
			'% Returning Cust': 'percent_returning_customer',
			'Contribution from New User': 'new_user_contribution',
			'User Registered': 'registered_customer',
			Footfall: 'total_visitor',
			CR: 'cr',
			'% Guest': 'guest_percentage',
			'Revenue Staff': 'revenue_staff',
		};
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportSinclairDashboard({
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
		fieldName,
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
			subject: 'Export Sinclair Dashboard',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
