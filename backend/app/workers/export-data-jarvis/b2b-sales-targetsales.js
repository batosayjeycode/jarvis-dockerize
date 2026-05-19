/**
 * @author Dikdik Kusdinar
 **/

'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2b-sales-targetsales' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CSalesTargetSales extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2b-sales-targetsales');
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
					if (type === 'brand') {
						obj['Id Brand'] = row.id_manufacturer;
						obj['Brand'] = row.brand;
					} else if (type === 'channel') {
						obj['Id Channel'] = row.id_channel;
						obj['Channel'] = row.channel;
					} else if (type === 'branch') {
						obj['Id Branch'] = row.id_branch;
						obj['Branch'] = row.branch;
					}
					obj['Target Sales'] = row.target_sales;
					obj['Total COGS'] = row.total_cogs;
					obj['Total Retail Value'] = row.total_retail_value;
					obj['Actual Sales'] = row.actual_sales;
					obj['Diff Stock'] = row.diff_stock;
					obj['Diff Sales'] = row.diff_sales;
					obj['Achievment (%)'] = row.achiev_percentage;
					if (this.options.document.is_compare && this.options.document.is_compare === '1') {
						(this.options.document.compare_period_list || []).forEach((list) => {
							obj['Target Sales ' + list.value] = row[`target_sales_${list.key}`];
							obj['Actual Sales ' + list.value] = row[`actual_sales_${list.key}`];
							obj['Total Retail Value ' + list.value] = row[`retail_value_${list.key}`];
							obj['Diff Stock ' + list.value] = row[`diff_stock_${list.key}`];
							obj['Diff Sales ' + list.value] = row[`diff_sales_${list.key}`];
							obj['Achievment ' + list.value + ' (%)'] = row[`achiev_percentage_${list.key}`];
						});
					}
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2b-sales-targetsales`);

	const outputFile = file_name;
	let type = file_name.split('_');
	type = type[1];
	let fields = [];
	if (type === 'brand') {
		fields = [
			'Id Brand',
			'Brand',
			'Target Sales',
			'Total COGS',
			'Total Retail Value',
			'Actual Sales',
			'Diff Stock',
			'Diff Sales',
			'Achievment (%)',
		];
	} else if (type === 'channel') {
		fields = [
			'Id Channel',
			'Channel',
			'Target Sales',
			'Total COGS',
			'Total Retail Value',
			'Actual Sales',
			'Diff Stock',
			'Diff Sales',
			'Achievment (%)',
		];
	} else if (type === 'branch') {
		fields = [
			'Id Branch',
			'Branch',
			'Target Sales',
			'Total COGS',
			'Total Retail Value',
			'Actual Sales',
			'Diff Stock',
			'Diff Sales',
			'Achievment (%)',
		];
	}
	if (document.is_compare && document.is_compare === '1') {
		(document.compare_period_list || []).forEach((period) => {
			fields.push(`Target Sales ${period.value}`);
			fields.push(`Actual Sales ${period.value}`);
			fields.push(`Total Retail Value ${period.value}`);
			fields.push(`Diff Stock ${period.value}`);
			fields.push(`Diff Sales ${period.value}`);
			fields.push(`Achievment ${period.value} (%)`);
		});
	}

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CSalesTargetSales({
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
			subject: 'Export B2B Sales Target Sales',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
