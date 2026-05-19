'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-automation-query-socobox-csv' });
const workerHelpers = require('../../helpers/workerHelper');

let fieldName = {};
const fieldNameGeneral = {
	user_id: 'user_id',
	email: 'email',
	soco_id: 'soco_id',
	registered_date: 'registered_date',
	customer_age: 'customer_age',
	province_name: 'province_name',
	city_type: 'city_type',
	city_name: 'city_name',
	gender: 'gender',
	skin_color: 'skin_color',
	skin_condition: 'skin_condition',
	skin_type: 'skin_type',
	face_type: 'face_type',
	undertone: 'undertone',
	hair_color: 'hair_color',
	hair_length: 'hair_length',
	hair_type: 'hair_type',
	hair_condition: 'hair_condition',
};
const fieldNameProduct = { ...fieldNameGeneral, product_name: 'product_name', brand: 'brand' };
const fieldNameBrand = { ...fieldNameGeneral, brand: 'brand' };

class AutomationQuerySocoboxCsv extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-automation-query-socobox-csv');
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
	logger.info('Start jarvis export-automation-query-socobox-csv');
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

	if (!document.file_type) {
		document.file_type = 'product name';
	}

	switch (document.file_type) {
		case 'product name':
			fieldName = fieldNameProduct;
			break;
		case 'brand':
			fieldName = fieldNameBrand;
			break;
		case 'total general review':
			fieldName = fieldNameGeneral;
			break;
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new AutomationQuerySocoboxCsv({
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
			subject: 'Export Automation Query Socobox',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
