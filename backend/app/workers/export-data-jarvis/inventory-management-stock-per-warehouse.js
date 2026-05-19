'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'inventory-management-stock-per-warehouse' });
const { Readable } = require('stream');
const workerHelpers = require('../../helpers/workerHelper');
const CommonHelper = require('../../helpers/commonHelper');

class ExportInventoryManagementStockPerWareHouse extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-inventory-management-stock-per-warehouse');
	}
	getTotalCount() {
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total}`,
			);
			return this?.options?.document?.total;
		}).catch((err) => {
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
			const query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY id_product DESC LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					self.options.csv.push({
						'Id Product': row.id_product,
						'Id Product Odoo': row.id_product_odoo,
						'Ean 13': row.ean13,
						Reference: row.reference,
						reference_odoo: row.reference_odoo,
						'Product Name': row.product_name,
						Attribute: row.product_attribute,
						Brand: row.brand,
						Classification: row.classification,
						'Dimension (W x H x V x L + We)': 'N/A',
						'Shelf Location': row.shelf_location,
						Warehouse: row.warehouse,
						'Total Stock': row.odoo_stock,
						Incoming: row.incoming_stock,
						Price: row.base_price,
						Cogs: (row?.odoo_cogs && Math.round(row.odoo_cogs)) || 0,
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

module.exports = async (message) => {
	logger.info('Start jarvis inventory-management-stock-per-warehouse');
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

	const isReadCogs = CommonHelper.hasAccess(context, 'inventory-management.all-sociolla.current-stock', 'read-cogs');
	const isReadPrice = CommonHelper.hasAccess(
		context,
		'inventory-management.all-sociolla.current-stock',
		'read-price',
	);

	const outputFile = file_name;
	const fields = [
		'Id Product',
		'Id Product Odoo',
		'Ean 13',
		'Reference',
		'reference_odoo',
		'Product Name',
		'Attribute',
		'Brand',
		'Classification',
		'Dimension (W x H x V x L + We)',
		'Shelf Location',
		'Warehouse',
		'Total Stock',
		'Incoming',
	];

	if (isReadCogs) {
		fields.push('Cogs');
	}

	if (isReadPrice) {
		fields.push('Price');
	}

	const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}}`,
	);
	const data_stocks = await Promise.resolve(client.connectDwh.query(queryRow));
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] TABLE ${document.tmp_table} CREATED`);
	document.total = data_stocks?.rowCount || 0;

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportInventoryManagementStockPerWareHouse({
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
			subject: 'Jarvis : Export Inventory Management Stock Per Warehouse',
		});
		await client.connectDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
