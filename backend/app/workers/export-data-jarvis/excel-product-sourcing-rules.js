'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const writeXlsxFile = require('write-excel-file/node');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-excel-product-sourcing-rules' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportExcelProductSourcingRules extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-excel-product-sourcing-rules');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectNewDwh.query(this.options.queryCount);
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
			return Q.all(this.options.client.connectNewDwh.query(query));
		})
			.then((result) => {
				const rows = result.rows || [];
				const mapping = {
					product: 'Product Variant',
					brand: 'Brand',
				};
				for (const row of rows) {
					const data = [];
					for (const val of Object.entries(this.options.fieldName)) {
						const isDate = ['created_at', 'updated_at'].includes(val[1]);
						if (isDate) {
							const dateValue = new Date(row[val[1]]);
							dateValue.setHours(dateValue.getHours() + 7);
							row[val[1]] = dateValue;
						}
						const obj = {
							value: val[1] === 'data_type' ? mapping[row[val[1]]] : row[val[1]],
							borderColor: '#000000',
						};
						if (isDate) {
							obj['type'] = Date;
							obj['format'] = 'dd/mmm/yyyy hh:mm:ss';
						}
						data.push(obj);
					}
					self.options.data.push(data);
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis excel-product-sourcing-rules`);

	const outputFile = file_name;
	const fieldName = {
		ID: 'id',
		'Data Type': 'data_type',
		Name: 'name',
		'Sociolla ID': 'sociolla_id',
		'Cerebro ID': 'odoo_id',
		'Cerebro Indo Company ID': 'source_id',
		'Cerebro VN Company ID': 'source_vn',
		'Created At': 'created_at',
		'Created By': 'created_by_email',
		'Updated At': 'updated_at',
		'Updated By': 'updated_by_email',
	};
	const HEADER_ROW = [];
	for (const key in fieldName) {
		HEADER_ROW.push({
			value: key,
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'left',
		});
	}

	const data = [HEADER_ROW];
	const columns = [
		{ width: 15 },
		{ width: 15 },
		{ width: 40 },
		{ width: 30 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 30 },
		{ width: 20 },
		{ width: 30 },
	];
	const task = new ExportExcelProductSourcingRules({
		limit: 200,
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
		data,
		fieldName,
		stopOnError: true,
		rejectOnError: true,
	});

	try {
		await task.execute();
		await writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			sheet: 'Product Sourcing Rule',
		});
		await workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export Product Sourcing Rule',
			is_export_excel: true,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
