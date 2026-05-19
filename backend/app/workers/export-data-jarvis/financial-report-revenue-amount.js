'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-financial-report-revenue-amount' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportFinancialReportRevenueAmount extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-financial-report-revenue-amount');
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
			.then((resultSales) => {
				resultSales.rows.map((row) => {
					if (row.period) {
						self.options.csv.push({
							period:
								this.options.document.period_type === 'daily'
									? moment(new Date(row.period)).format('YYYY-MM-DD')
									: row.period,
							total_order: row.total_order,
							sales: row.sales,
							revenue: row.revenue,
							disc_by_brand: row.disc_by_brand,
							disc_by_sociolla: row.disc_by_sociolla,
							disc_sales: row.disc_sales ? `${row.disc_sales.toFixed(2)}%` : '',
						});
					}
				});
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
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-financial-report-revenue-amount`,
	);

	const outputFile = file_name;
	const fields = ['period', 'total_order', 'sales', 'revenue', 'disc_by_brand', 'disc_by_sociolla', 'disc_sales'];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportFinancialReportRevenueAmount({
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
		csv: input,
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
			subject: 'Jarvis : Export Financial Report Revenue Amount',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
