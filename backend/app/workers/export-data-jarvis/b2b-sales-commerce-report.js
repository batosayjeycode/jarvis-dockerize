/**
 * @author Dikdik Kusdinar
 **/
'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const CommonHelper = require('../../helpers/commonHelper');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2b-sales-commerce-report' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2BSalesCommerceReport extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2b-sales-commerce-report');
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
		const document = this.options.document;
		const periodList = this.options.document.period_list;
		const viewPoint = this.options.document.view_point;
		const dataDisplay = this.options.document.data_display;
		const displayType = this.options.document.display_type;
		let quarterList = [];
		let obj = {};
		const context = this.options.context;
		const isReadSalesGross = CommonHelper.hasAccess(context, 'b2b-sociolla.data-visibility', 'read-sales-gross');
		const isReadSalesNet = CommonHelper.hasAccess(context, 'b2b-sociolla.data-visibility', 'read-sales-net');
		const isReadSalesValid = CommonHelper.hasAccess(context, 'b2b-sociolla.data-visibility', 'read-sales-valid');
		const valueType = this.options.document.value_type;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const queryData = `${this.options.queryRow.dataQuery} LIMIT ${limit} OFFSET ${offset}`;
			const queryTotal = this.options.queryRow.totalQuery;
			return Q.all([
				this.options.client.connectDwh.query(queryData),
				this.options.client.connectDwh.query(queryTotal),
			]);
		})
			.then(([dataResults, totalResults]) => {
				const rows = dataResults.rows || [];
				const grandTotal = totalResults.rows[0].total_value || 1;

				for (const row of rows) {
					obj = {};
					quarterList = [];
					if (
						viewPoint === 'by_sales_team' &&
						(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
						displayType === '1'
					) {
						obj['Team Name'] = row.team_name;
						obj['Brand Name'] = row.brand;
					} else if (
						viewPoint === 'by_sales_team' &&
						(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
						displayType !== '1'
					) {
						obj['Brand Name'] = row.brand;
						obj['Team Name'] = row.team_name;
					} else if (
						viewPoint === 'by_sales_team' &&
						(dataDisplay === 'brand' || dataDisplay === 'product') &&
						displayType === '1'
					) {
						obj['Team Name'] = row.team_name;
						obj['Sales Person Name'] = row.sales_person_name;
					} else if (
						viewPoint === 'by_sales_team' &&
						(dataDisplay === 'brand' || dataDisplay === 'product') &&
						displayType !== '1'
					) {
						obj['Sales Person Name'] = row.sales_person_name;
						obj['Team Name'] = row.team_name;
					} else if (
						document.view_point === 'by_group_team' &&
						(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
						displayType === '1'
					) {
						obj['Group Team Name'] = row.group_team_name;
						obj['Brand Name'] = row.brand;
					} else if (
						document.view_point === 'by_group_team' &&
						(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
						displayType !== '1'
					) {
						obj['Brand Name'] = row.brand;
						obj['Group Team Name'] = row.group_team_name;
					} else if (
						document.view_point === 'by_group_team' &&
						(dataDisplay === 'brand' || dataDisplay === 'product') &&
						displayType === '1'
					) {
						obj['Group Team Name'] = row.group_team_name;
						obj['Sales Team Name'] = row.sales_team_name;
					} else if (
						document.view_point === 'by_group_team' &&
						(dataDisplay === 'brand' || dataDisplay === 'product') &&
						displayType !== '1'
					) {
						obj['Sales Team Name'] = row.sales_team_name;
						obj['Group Team Name'] = row.group_team_name;
					} else if (
						document.view_point === 'by_sales_person' &&
						(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
						displayType === '1'
					) {
						obj['Sales Person Name'] = row.sales_person_name;
						obj['Brand Name'] = row.brand;
					} else if (
						document.view_point === 'by_sales_person' &&
						(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
						displayType !== '1'
					) {
						obj['Brand Name'] = row.brand;
						obj['Sales Person Name'] = row.sales_person_name;
					} else if (
						document.view_point === 'by_sales_person' &&
						(dataDisplay === 'brand' || dataDisplay === 'product') &&
						displayType === '1'
					) {
						obj['Sales Person Name'] = row.sales_person_name;
						obj['Group Team Name'] = row.group_team_name;
					} else if (
						document.view_point === 'by_sales_person' &&
						(dataDisplay === 'brand' || dataDisplay === 'product') &&
						displayType !== '1'
					) {
						obj['Group Team Name'] = row.group_team_name;
						obj['Sales Person Name'] = row.sales_person_name;
					} else if (
						document.view_point === 'by_customer' &&
						(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
						displayType === '1'
					) {
						obj['Customer Name'] = row.customer_name;
						obj['Brand Name'] = row.brand;
					} else if (
						document.view_point === 'by_customer' &&
						(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
						displayType !== '1'
					) {
						obj['Brand Name'] = row.brand;
						obj['Customer Name'] = row.customer_name;
					} else if (
						document.view_point === 'by_customer' &&
						(dataDisplay === 'brand' || dataDisplay === 'product') &&
						displayType === '1'
					) {
						obj['Customer Name'] = row.customer_name;
						obj['Group Team Name'] = row.group_team_name;
					} else if (
						document.view_point === 'by_customer' &&
						(dataDisplay === 'brand' || dataDisplay === 'product') &&
						displayType !== '1'
					) {
						obj['Group Team Name'] = row.group_team_name;
						obj['Customer Name'] = row.customer_name;
					}

					if (
						(isReadSalesGross && valueType === 'gross') ||
						(isReadSalesNet && valueType === 'net') ||
						(isReadSalesValid && valueType === 'valid')
					) {
						obj['sub_value'] = row.sub_value;
						obj['percentage'] = (row.sub_value / grandTotal) * 100;
					} else {
						obj['sub_value'] = 0;
						obj['percentage'] = 0;
					}

					(periodList || []).forEach((pl) => {
						if (document.period_type === 'quarterly') {
							if (!quarterList.includes(pl.key)) {
								if (isReadSalesGross && valueType === 'gross') {
									obj[`Value ${pl.text}`] = row[`value_${pl.key}`];
								} else if (isReadSalesNet && valueType === 'net') {
									obj[`Value ${pl.text}`] = row[`value_${pl.key}`];
								} else if (isReadSalesValid && valueType === 'valid') {
									obj[`Value ${pl.text}`] = row[`value_${pl.key}`];
								} else {
									obj[`Value ${pl.text}`] = 0;
								}

								quarterList.push(pl.key);
							}
						} else {
							if (isReadSalesGross && valueType === 'gross') {
								obj[`Value ${pl.text}`] = row[`value_${pl.key}`];
							} else if (isReadSalesNet && valueType === 'net') {
								obj[`Value ${pl.text}`] = row[`value_${pl.key}`];
							} else if (isReadSalesValid && valueType === 'valid') {
								obj[`Value ${pl.text}`] = row[`value_${pl.key}`];
							} else {
								obj[`Value ${pl.text}`] = 0;
							}
						}
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
	logger.info('Start jarvis export-b2b-sales-commerce-report');
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

	const outputFile = file_name;
	const fields = [];
	const viewPoint = document.view_point;
	const dataDisplay = document.data_display;
	const displayType = document.display_type;
	const periodList = document.period_list;
	const quarterList = [];

	if (
		viewPoint === 'by_sales_team' &&
		(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
		displayType === '1'
	) {
		fields.push('Team Name');
		fields.push('Brand Name');
	} else if (
		viewPoint === 'by_sales_team' &&
		(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
		displayType !== '1'
	) {
		fields.push('Brand Name');
		fields.push('Team Name');
	} else if (
		viewPoint === 'by_sales_team' &&
		(dataDisplay === 'brand' || dataDisplay === 'product') &&
		displayType === '1'
	) {
		fields.push('Team Name');
		fields.push('Sales Person Name');
	} else if (
		viewPoint === 'by_sales_team' &&
		(dataDisplay === 'brand' || dataDisplay === 'product') &&
		displayType !== '1'
	) {
		fields.push('Sales Person Name');
		fields.push('Team Name');
	} else if (
		document.view_point === 'by_group_team' &&
		(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
		displayType === '1'
	) {
		fields.push('Group Team Name');
		fields.push('Brand Name');
	} else if (
		document.view_point === 'by_group_team' &&
		(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
		displayType !== '1'
	) {
		fields.push('Brand Name');
		fields.push('Group Team Name');
	} else if (
		document.view_point === 'by_group_team' &&
		(dataDisplay === 'brand' || dataDisplay === 'product') &&
		displayType === '1'
	) {
		fields.push('Group Team Name');
		fields.push('Sales Team Name');
	} else if (
		document.view_point === 'by_group_team' &&
		(dataDisplay === 'brand' || dataDisplay === 'product') &&
		displayType !== '1'
	) {
		fields.push('Sales Team Name');
		fields.push('Group Team Name');
	} else if (
		document.view_point === 'by_sales_person' &&
		(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
		displayType === '1'
	) {
		fields.push('Sales Person Name');
		fields.push('Brand Name');
	} else if (
		document.view_point === 'by_sales_person' &&
		(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
		displayType !== '1'
	) {
		fields.push('Brand Name');
		fields.push('Sales Person Name');
	} else if (
		document.view_point === 'by_sales_person' &&
		(dataDisplay === 'brand' || dataDisplay === 'product') &&
		displayType === '1'
	) {
		fields.push('Sales Person Name');
		fields.push('Group Team Name');
	} else if (
		document.view_point === 'by_customer' &&
		(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
		displayType === '1'
	) {
		fields.push('Customer Name');
		fields.push('Brand Name');
	} else if (
		document.view_point === 'by_customer' &&
		(dataDisplay === 'qty' || dataDisplay === 'value' || dataDisplay === 'door') &&
		displayType !== '1'
	) {
		fields.push('Brand Name');
		fields.push('Customer Name');
	} else if (
		document.view_point === 'by_customer' &&
		(dataDisplay === 'brand' || dataDisplay === 'product') &&
		displayType === '1'
	) {
		fields.push('Customer Name');
		fields.push('Group Team Name');
	} else if (
		document.view_point === 'by_customer' &&
		(dataDisplay === 'brand' || dataDisplay === 'product') &&
		displayType !== '1'
	) {
		fields.push('Group Team Name');
		fields.push('Customer Name');
	}

	fields.push('sub_value');
	fields.push('percentage');

	(periodList || []).forEach((pl) => {
		if (document.period_type === 'quarterly') {
			if (!quarterList.includes(pl.key)) {
				fields.push(`Value ${pl.text}`);
			}
			quarterList.push(pl.key);
		} else {
			fields.push(`Value ${pl.text}`);
		}
	});
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2BSalesCommerceReport({
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
			subject: 'Export B2B Sales Commerce Report',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
