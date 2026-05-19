'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const writeXlsxFile = require('write-excel-file/node');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-b2b-excel-sales-order-summaries' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const dateFields = ['document_date'];
const percentFields = ['valid_conv', 'net_conv'];
const quantityFields = ['gross_qty', 'valid_qty', 'net_qty'];
const numberFields = [
	'gross_nmv',
	'gross_total_discount',
	'gross_net_revenue',
	'valid_nmv',
	'valid_total_discount',
	'valid_net_revenue',
	'net_nmv',
	'net_total_discount',
	'net_net_revenue',
	'amount_due',
];

class ExportExcelSalesOrderSummaries extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-b2b-excel-sales-order-summaries');
	}
	getTotalCount() {
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total}`,
			);
			return this?.options?.document?.total;
		}).catch((err) => {
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
			return Q.all(this.options.client.connectNewDwh.query(query));
		})
			.then((result) => {
				const rows = result.rows || [];

				for (const row of rows) {
					const data = [];

					for (const val of Object.entries(this.options.fieldName)) {
						const value = row[val[1]];
						let obj = { value, borderColor: '#000000' };

						if (numberFields.includes(val[1])) {
							obj = {
								...obj,
								value: CommonHelper.zeroFormatNumber(value),
								type: Number,
								format: '#,##0.00',
							};
						} else if (dateFields.includes(val[1])) {
							obj = { ...obj, value: value ? new Date(value) : null, type: Date, format: 'dd/mmm/yyyy' };
						} else if (quantityFields.includes(val[1])) {
							obj = { ...obj, value: value ? parseInt(value) : 0, type: Number, format: '#,##0' };
						} else if (percentFields.includes(val[1])) {
							obj = { ...obj, value: value ? parseFloat(value) / 100 : 0, type: Number, format: '0.00%' };
						}

						data.push(obj);
					}

					self.options.data.push(data);
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const grand_total = document.grand_total;
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis excel-gross-profit-summaries`);
	const outputFile = file_name;
	const fieldName = {
		'Document Reference': 'document_reference',
		'Document Date': 'document_date',
		'Customer ID': 'customer_id',
		Customer: 'customer_name',
		'Parent Customer': 'parent_customer',
		Channel: 'channel',
		Type: 'type',
		Account: 'account',
		City: 'city',
		Province: 'province',
		'Payment Term': 'payment_term',
		'Sales Team': 'sales_team',
		Salesperson: 'sales_person',
		'Gross | Qty': 'gross_qty',
		'Gross | NMV Before Discount': 'gross_nmv',
		'Gross | Total Discount': 'gross_total_discount',
		'Gross | Net Revenue': 'gross_net_revenue',
		'Valid | Qty': 'valid_qty',
		'Valid | NMV Before Discount': 'valid_nmv',
		'Valid | Total Discount': 'valid_total_discount',
		'Valid | Net Revenue': 'valid_net_revenue',
		'Valid | Conv.': 'valid_conv',
		'Net | Qty': 'net_qty',
		'Net | NMV Before Discount': 'net_nmv',
		'Net | Total Discount': 'net_total_discount',
		'Net | Net Revenue': 'net_net_revenue',
		'Net | Conv.': 'net_conv',
		'Net | Amount Due': 'amount_due',
	};

	const TITLE = [
		[
			{
				value: 'Sales Order',
				fontWeight: 'bold',
				align: 'left',
			},
		],
		[
			{
				value: 'Start Date',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: new Date(document.start_date),
				fontWeight: 'bold',
				align: 'left',
				type: Date,
				format: 'dd/mmm/yyyy',
			},
		],
		[
			{
				value: 'End Date',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: new Date(document.end_date),
				fontWeight: 'bold',
				align: 'left',
				type: Date,
				format: 'dd/mmm/yyyy',
			},
		],
		[
			{
				value: 'Filter',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: document?.export_label_filter_option || '',
				fontWeight: 'bold',
				align: 'left',
			},
		],
	];

	const HEADER_ROW = Object.entries(fieldName).map(([f]) => {
		return {
			value: f,
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#c5deb5',
			align: 'left',
		};
	});

	const data = [...TITLE, [], [], HEADER_ROW];
	const columns = [
		{ width: 30 },
		{ width: 15 },
		{ width: 10 },
		{ width: 30 },
		{ width: 30 },
		{ width: 10 },
		{ width: 10 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 15 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 15 },
		{ width: 15 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 15 },
		{ width: 20 },
	];

	const task = new ExportExcelSalesOrderSummaries({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		additionQuery: criteria.additionQuery,
		document,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		data,
		stopOnError: true,
		rejectOnError: true,
		fieldName,
	});

	try {
		await task.execute();

		grand_total['document_reference'] = 'Total';
		grand_total['type'] = '';
		const grand_total_data = [];
		for (const val of Object.entries(fieldName)) {
			const value = grand_total[val[1]];
			let obj = { value, borderColor: '#000000' };

			if (numberFields.includes(val[1])) {
				obj = { ...obj, value: CommonHelper.zeroFormatNumber(value), type: Number, format: '#,##0.00' };
			} else if (dateFields.includes(val[1])) {
				obj = { ...obj, value: value ? new Date(value) : null, type: Date, format: 'dd/mmm/yyyy' };
			} else if (quantityFields.includes(val[1])) {
				obj = { ...obj, value: value ? parseInt(value) : 0, type: Number, format: '#,##0' };
			} else if (percentFields.includes(val[1])) {
				obj = { ...obj, value: value ? parseFloat(value) / 100 : 0, type: Number, format: '0.00%' };
			}
			grand_total_data.push(obj);
		}

		data.push(grand_total_data);

		await writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			sheet: 'Sales Order',
		});
		await workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export Sales Order',
			is_export_excel: true,
		});
		await client.connectNewDwh.query(`DROP TABLE ${criteria.document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
