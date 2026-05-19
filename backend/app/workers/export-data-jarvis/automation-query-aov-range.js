'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-automation-query-aov-range-csv' });
const workerHelpers = require('../../helpers/workerHelper');
const fieldName = {
	'AOV Range': 'aov_range',
	'No of Trx': 'no_of_trx',
	'%': 'percentage',
};
let fieldContent = [];

class AutomationQueryAovRangeCsv extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-automation-query-aov-range-csv');
	}
	getTotalCount() {
		logger.info(`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: 1`);
		return Q.resolve(1);
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
					fieldContent.forEach((val) => {
						const data = Object.entries(fieldName).reduce((acc, el) => {
							let value = '';
							if (el[1] == 'aov_range') {
								const tmp = val.split('trx_');
								value = tmp[1].replace('_', ' - ');
							} else if (el[1] == 'no_of_trx') {
								value = row[`total_${val}`] || null;
							} else if (el[1] == 'percentage') {
								value = row[`percentage_${val}`] || null;
								if (value) {
									value = parseFloat(value);
									value = `${value.toFixed(2)}%`;
								}
							}
							acc[el[0]] = value;
							return acc;
						}, {});
						self.options.csv.push(data);
					});
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

const getFieldContent = (document) => {
	const field = [];
	let startValue = 0;
	let endValue = 0;
	const cntLoop = Math.ceil(
		(parseInt(document.end_value) - parseInt(document.start_value)) / parseInt(document.partition),
	);
	for (let i = 0; i < cntLoop; i++) {
		startValue = parseInt(document.partition) * i + parseInt(document.start_value);
		endValue = parseInt(document.partition) + startValue - 1;
		if (endValue > parseInt(document.end_value)) {
			endValue = parseInt(document.end_value) - 1;
		}
		field.push(`trx_${startValue}_${endValue}`);
	}
	field.push(`trx_${document.end_value}`);
	field.push('trx_total');
	return field;
};

module.exports = async (message) => {
	logger.info('export-automation-query-aov-range-csv');
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

	logger.info(`document: ${JSON.stringify(document)}`);
	fieldContent = getFieldContent(document);

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new AutomationQueryAovRangeCsv({
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
			subject: 'Export Automation Query AOV Range',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
