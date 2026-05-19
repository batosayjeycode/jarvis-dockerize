'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment-timezone');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'inventory-management-oos-offline' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportInventoryManagementAlertOosOffline extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-inventory-management-alert-oos-offline');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(`Total count: ${result.rows[0].count}`);
				return parseInt(result.rows[0].count);
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
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (el[1] === 'created_at') {
							row[el[1]] = row[el[1]] ? moment(new Date(row[el[1]])).format('YYYY-MM-DD HH:mm:ss') : '';
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
	logger.info('Start jarvis inventory-management-stock-oos-offline');

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

	let fieldName = {
		REFERENCE: 'reference',
		'PRODUCT NAME': 'product_name',
		'PRODUCT ATTRIBUTE': 'product_attribute',
		BRAND: 'brand',
		'AVG DAILY SALES': 'avg_daily_sales',
		STOCK: 'stock',
		'OWH STOCK': 'offline_wh_stock',
		'STOCK COVER': 'stock_cover',
		'SAFETY STOCK': 'safety_stock',
		'INCOMING STOCK': 'incoming_stock',
		'BASE PRICE': 'base_price',
		'CREATED AT': 'created_at',
		'STORE ALIAS': 'store_alias',
		'STATUS ITEM': 'status_item',
	};

	if (document?.sri_offline) {
		fieldName = {
			REFERENCE: 'reference',
			'PRODUCT NAME': 'product_name',
			'PRODUCT ATTRIBUTE': 'product_attribute',
			BRAND: 'brand',
			'AVG DAILY SALES': 'avg_daily_sales',
			STOCK: 'stock',
			'STOCK COVER': 'stock_cover',
			'SAFETY STOCK': 'safety_stock',
			'INCOMING STOCK': 'incoming_stock',
			'BASE PRICE': 'base_price',
			'CREATED AT': 'created_at',
			'STATUS ITEM': 'status_item',
		};
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportInventoryManagementAlertOosOffline({
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
			subject: 'Export Alert OOS Offline',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
