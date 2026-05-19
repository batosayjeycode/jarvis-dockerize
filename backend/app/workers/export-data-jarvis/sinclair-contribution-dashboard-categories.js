'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-sinclair-contribution-dashboard-categories',
});
const workerHelpers = require('../../helpers/workerHelper');

class SinclairContributionDashboardCategories extends AbstractBatchTask {
	constructor(options) {
		super(options, 'sinclair-contribution-dashboard-categories');
	}
	getTotalCount() {
		logger.info(`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: 2000`);
		return Q.resolve(2000);
	}
	processBatch(limit, offset) {
		const self = this;
		const rows = this.options.queryRow || [];
		for (const row of rows) {
			self.options.csv.push(row);
		}

		const grand_total = {
			...this.options.queryCount,
			store_name: 'GRAND TOTAL',
			store_alias: '',
			store_size: '',
		};
		self.options.csv.push(grand_total);
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
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis sinclair-contribution-dashboard-categories`,
	);

	const outputFile = file_name;
	const fields = Object.keys(criteria.queryRow[0]);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new SinclairContributionDashboardCategories({
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
			subject: 'Export Sinclair contribution-dashboard-categories',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
