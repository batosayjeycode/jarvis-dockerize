'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-category-split' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportCategorySplit extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-category-split');
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
				const objEnt = Object.entries(this.options.fields);
				for (const row of rows) {
					const obj = objEnt.reduce((accu, el, idx) => {
						if (el[0].includes('percent') || el[0] === 'evo') {
							accu[el[1]] = `${parseFloat(row[el[0]]).toFixed(2)}%`;
						} else if (el[0].includes('value')) {
							accu[el[1]] = `${parseFloat(row[el[0]]).toFixed(2)}`;
						} else {
							accu[el[1]] = row[el[0]] || '';
						}
						return accu;
					}, {});
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
	const file_name = message.data.file_name || null;
	const doc = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis category-split`);

	const fields = {
		id_category: 'ID Category',
		id_category_soco: 'ID Category Soco',
		category: 'Category',
	};

	if (doc.category_type) {
		fields.tree_category = 'Tree Categories';
	}

	if (['monthly', 'yearly'].includes(doc.period_type)) {
		for (const val of doc.period_list) {
			fields[`value_${val.key}`] = `value_${val.key}`;
			fields[`percent_${val.key}`] = `percent_${val.key}`;
		}
	} else if (doc.period_type === 'quarterly') {
		for (const val of doc.period_list) {
			fields[`value_${val.text_q}`] = `value_${val.text_q}`;
			fields[`percent_${val.text_q}`] = `percent_${val.text_q}`;
		}
	}
	fields.total_value = 'Total Value';
	fields.total_percent = 'Total Percent';
	fields.evo = 'Evo';

	const outputFile = file_name;
	const fieldHeader = Object.values(fields);
	const json2csv = new Transform({ fieldHeader }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportCategorySplit({
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
		fields,
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
			subject: 'Export Category Split',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
