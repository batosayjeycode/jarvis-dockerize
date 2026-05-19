'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-all-sociolla-mbr-brand' });
const workerHelpers = require('../../helpers/workerHelper');

const fieldName = {
	Brand: 'brand',
	'Brand Type': 'brand_type',
	Rank: 'rank',
	Remark: 'remark',
	'Net Revenue P6M': 'net_revenue_p6m',
	'Net Revenue Mar 2023': 'net_revenue_mar_2023',
	'Net Revenue Mar 2022': 'net_revenue_mar_2022',
	'Contribution (SOB) Mar 2023': 'contribution_sob_mar_2023',
	'Contribution (SOB) Mar 2022': 'contribution_sob_mar_2022',
	Growth: 'growth',
	Var: 'var',
	'Contribution Growth (SOG)': 'contribution_growth',
	'Net Revenue ytd 2023': 'net_revenue_ytd_2023',
	'Net Revenue ytd 2022': 'net_revenue_ytd_2022',
	'Contribution (SOB) YTD 2023': 'contribution_sob_mar_2023',
	'Contribution (SOB) YTD 2022': 'contribution_sob_mar_2022',
	'Growth 2': 'growth_2',
	'Contribution Growth (SOG) 2': 'contribution_growth_2',
};

class ExportAllSociollaMbrBrand extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-all-sociolla-mbr-brand');
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
					const data = Object.entries(fieldName).reduce((acc, el) => {
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
	logger.info('Start jarvis all-sociolla-mbr-brand');
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
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportAllSociollaMbrBrand({
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
			subject: 'Export Monthly Business Report - Brand',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
