'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'nps-statistic-dashboard-csv' });
const workerHelpers = require('../../helpers/workerHelper');

class NpsStatisticDashboardCsv extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-nps-statistic-dashboard-csv');
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
				const getNameScaleNps = (val) => {
					let res = null;
					(this.options.scaleNps || []).forEach((el) => {
						const npsValue = el.value.split(' to ');
						if (val >= parseInt(npsValue[0]) && val <= parseInt(npsValue[1])) {
							res = el.name;
							return false;
						}
					});
					return res;
				};
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (el[1] === 'nps') {
							row[el[1]] =
								(parseInt(row.total_response) &&
									Math.round(
										(parseInt(row.total_promotor) / parseInt(row.total_response)) * 100 -
											(parseInt(row.total_detractor) / parseInt(row.total_response)) * 100,
									)) ||
								null;
						} else if (el[1] === 'scale') {
							row[el[1]] = row.nps != null ? getNameScaleNps(row.nps) : null;
						} else if (el[1] === 'percentage_response') {
							row[el[1]] =
								(parseInt(row.total_response) &&
									parseInt(row.total_order) &&
									parseFloat(
										Number.parseFloat(
											(parseInt(row.total_response) / parseInt(row.total_order)) * 100,
										).toFixed(2),
									)) ||
								0;
						}
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis nps-statistic-dashboard-csv`);

	const fieldName = {
		STORE: 'store_name',
		ALIAS: 'store_alias',
		PROMOTER: 'total_promotor',
		DETRACTOR: 'total_detractor',
		'TOTAL RESPONSES': 'total_response',
		NPS: 'nps',
		SCALE: 'scale',
		ORDER: 'total_order',
		'PERCENTAGE RESPONSE': 'percentage_response',
	};

	const scaleNps = [
		{
			value: '-100 to 10',
			name: 'Need Improvement',
		},
		{
			value: '0 to 30',
			name: 'Good',
		},
		{
			value: '31 to 70',
			name: 'Great',
		},
		{
			value: '71 to 100',
			name: 'Excellent',
		},
	];

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new NpsStatisticDashboardCsv({
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
		fieldName,
		scaleNps,
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
			subject: 'Export NPS Statistic Dashboard',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
