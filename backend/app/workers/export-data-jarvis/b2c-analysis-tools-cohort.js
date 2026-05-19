'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-analysis-tools-cohort' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CAnalysisToolsCohort extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-analysis-tools-cohort');
	}
	getTotalCount() {
		logger.info(`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: 2000`);
		return Q.resolve(2000);
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				const objEntries = Object.entries(this.options.paramFieldCsv);
				for (const row of rows) {
					const data = objEntries.reduce((acc, el) => {
						acc[el[0]] = row[el[1]] || 0;
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-b2c-analysis-tools-cohort`);

	const fieldName = {
		aging: 'aging',
		first_order_month_id: 'first_order_month_id',
		first_order_month: 'first_order_month',
	};

	let paramFieldCsv = {};
	let newParamField = {
		...fieldName,
		'count of unique customer id': 'total',
	};
	if (document && document.value_mode) {
		if (document.value_mode == 'order') {
			newParamField = {
				...fieldName,
				'count of unique order': 'total',
			};
		} else if (document.value_mode == 'before-discount') {
			newParamField = {
				...fieldName,
				'sum of sales value (before discount)': 'total',
			};
		}
	}
	paramFieldCsv = newParamField;
	const outputFile = file_name;
	const fields = Object.keys(paramFieldCsv);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CAnalysisToolsCohort({
		limit: 500,
		offset: 0,
		queryRow: criteria.queryRow,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		document,
		paramFieldCsv,
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
			subject: 'Export B2C Analysis Tools Cohort',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
