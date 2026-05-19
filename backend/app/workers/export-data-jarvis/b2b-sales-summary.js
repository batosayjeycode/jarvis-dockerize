'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2b-sales-summary' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2BSalesSummary extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2b-sales-summary');
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
				const reportType = this.options.document.report_type;
				const fieldReportTypeHeader = {
					per_channel: 'Channel',
					per_type: 'Type',
					per_sales_team: 'Sales Team',
					summarize: '',
				};
				const fieldReportType = {
					per_channel: 'group1',
					per_type: 'group2',
					per_sales_team: 'sales_team',
					summarize: '',
				};
				const rows = result.rows || [];
				for (const row of rows) {
					const obj = {};
					if (type === 'by_brand') {
						obj['Brand'] = row.brand;
						obj[fieldReportTypeHeader[reportType]] = row[fieldReportType[reportType]] || '';
					} else if (type === 'by_team') {
						obj['Team ID'] = row.team_id;
						obj['Team Name'] = row.team_name;
						obj[fieldReportTypeHeader[reportType]] = row[fieldReportType[reportType]] || '';
					} else if (type === 'by_user') {
						obj['Salesperson ID'] = row.user_id;
						obj['Salesperson'] = row.user_name;
						obj[fieldReportTypeHeader[reportType]] = row[fieldReportType[reportType]] || '';
					} else if (type === 'by_group1') {
						obj['Channel'] = row.group1;
					} else if (type === 'by_group2') {
						obj['Type'] = row.group2;
					} else if (type === 'by_group3') {
						obj['Sales Team'] = row.group3;
					} else {
						obj['Product ID'] = row.id_product || row.id || '';
						obj['Reference'] = row.product_ref || row.reference || '';
						obj['Name'] = row.product_name || '';
						obj['Brand'] = row.brand || '';
						obj[fieldReportTypeHeader[reportType]] = row[fieldReportType[reportType]] || '';
					}
					obj['Qty Gross'] = row.ordered_qty_gross || 0;
					obj['Qty Valid'] = row.ordered_qty_valid || 0;
					obj['Qty Net'] = row.ordered_qty_net || 0;
					obj['Value Gross'] = row.total_price_gross || 0;
					obj['Value Valid'] = row.total_price_valid || 0;
					obj['Value Net'] = row.total_price_net || 0;

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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2b-sales-summary`);

	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Report Type: ${
			document?.report_type ?? 'Summarize'
		}, View Point : ${document?.view_point}`,
	);

	const outputFile = file_name;
	const type = document.view_point;
	const reportType = document.report_type;
	const fieldReportTypeHeader = {
		per_channel: 'Channel',
		per_type: 'Type',
		per_sales_team: 'Sales Team',
		summarize: '',
	};
	let fields = [];
	if (type === 'by_brand') {
		fields = [
			'Brand',
			'Qty Gross',
			'Qty Valid',
			'Qty Net',
			'Value Gross',
			'Value Valid',
			'Value Net',
			fieldReportTypeHeader[reportType],
		];
	} else if (type === 'by_team') {
		fields = [
			'Team ID',
			'Team Name',
			'Qty Gross',
			'Qty Valid',
			'Qty Net',
			'Value Gross',
			'Value Valid',
			'Value Net',
			fieldReportTypeHeader[reportType],
		];
	} else if (type === 'by_user') {
		fields = [
			'Salesperson ID',
			'Salesperson',
			'Qty Gross',
			'Qty Valid',
			'Qty Net',
			'Value Gross',
			'Value Valid',
			'Value Net',
			fieldReportTypeHeader[reportType],
		];
	} else if (type === 'by_group1') {
		fields = ['Channel', 'Qty Gross', 'Qty Valid', 'Qty Net', 'Value Gross', 'Value Valid', 'Value Net'];
	} else if (type === 'by_group2') {
		fields = ['Type', 'Qty Gross', 'Qty Valid', 'Qty Net', 'Value Gross', 'Value Valid', 'Value Net'];
	} else if (type === 'by_group3') {
		fields = ['Sales Team', 'Qty Gross', 'Qty Valid', 'Qty Net', 'Value Gross', 'Value Valid', 'Value Net'];
	} else {
		fields = [
			'Product ID',
			'Reference',
			'Name',
			'Brand',
			'Qty Gross',
			'Qty Valid',
			'Qty Net',
			'Value Gross',
			'Value Valid',
			'Value Net',
			fieldReportTypeHeader[reportType],
		];
	}

	if (reportType === 'summarize' && !['by_group1', 'by_group2', 'by_group3'].includes(type)) {
		fields.pop();
	}

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2BSalesSummary({
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
		totalCount: 0,
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
			subject: 'Export B2B Sales Summary',
		});
	} catch (error) {
		logger.error(error);
		throw error;
	}
};
