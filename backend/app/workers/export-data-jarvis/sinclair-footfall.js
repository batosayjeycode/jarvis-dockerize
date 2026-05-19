'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const moment = require('moment-timezone');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'sinclair-footfall' });
const workerHelpers = require('../../helpers/workerHelper');

class SinclairFootfall extends AbstractBatchTask {
	constructor(options) {
		super(options, 'sinclair-footfall');
	}
	getTotalCount() {
		return Q.resolve(2000);
	}
	processBatch(limit, offset) {
		const self = this;
		const rows = this.options.queryRow.data || [];
		for (const row of rows) {
			row.created_at = moment(row.created_at).tz('Asia/Jakarta').format('YYYY-MM-DD') || null;
			self.options.csv.push(row);
		}

		const grand_total = this.options.queryRow.data_footer.grand_total || {};
		grand_total.created_at = 'GRAND TOTAL';
		self.options.csv.push(grand_total);

		if (this.options.queryRow.data_compare.length) {
			self.options.csv.push({ created_at: '' });
			self.options.csv.push({ created_at: 'DATA COMPARE' });
			const compare_rows = this.options.queryRow.data_compare || [];
			for (const row of compare_rows) {
				row.created_at = moment(row.created_at).tz('Asia/Jakarta').format('YYYY-MM-DD') || null;
				self.options.csv.push(row);
			}

			const grandtotal = this.options.queryRow.data_footer_compare.grand_total || {};
			grandtotal.created_at = 'GRAND TOTAL';
			self.options.csv.push(grandtotal);
		}
		logger.info('Done');
	}
}

module.exports = async (message) => {
	logger.info('Start jarvis sinclair-footfall');

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
	const fields = Object.keys(criteria.queryRow.data[0]);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new SinclairFootfall({
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
			subject: 'Export Sinclair Footfall',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
