'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'inventory-management-stock' });
const { Readable } = require('stream');
const moment = require('moment');
const workerHelpers = require('../../helpers/workerHelper');
const CommonHelper = require('../../helpers/commonHelper');

class ExportInventoryManagementStock extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-inventory-management-stock');
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
			const query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY display_stock DESC, odoo_stock_1 DESC, id_product ASC, id_product_attribute ASC LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const { dimension_depth, dimension_height, dimension_width } = row;
					const dims = [dimension_depth, dimension_height, dimension_width];
					const isNA = Number(dimension_depth) + Number(dimension_height) + Number(dimension_width);
					self.options.csv.push({
						'Id Product': row.id_product,
						'Id Product Attribute': row.id_product_attribute,
						Reference: row.reference,
						'Ean 13': row.ean13,
						'Product Name': row.product_name,
						Attribute: row.product_attribute,
						Brand: row.brand,
						Classification: row.product_classification,
						'Category Default': row.category_default || '',
						'Tree Categories': row.tree_categories || '',
						'Dimension (Depth x Height x Width)': isNA > 0 ? dims.join(' x ') : 'N/A',
						'Display Stock': row.display_stock,
						'Reserved Stock': row.reserved_stock,
						'Total Stock': row.total_stock,
						Pacman: row.pacman || 0,
						Odoo: row.odoo_stock_1,
						Incoming: row.incoming_stock_1,
						Price: row.base_price,
						Cogs: row.odoo_cogs,
						'Shelf Location': row.shelf_location,
						'Avg 3 mos Sales': row.avg_3mos_sales,
						'Product Url Sociolla': row.url_sociolla,
						'Enabled in Sociolla': row.is_active_in_sociolla || '0',
						'Enabled in Lilla': row.is_active_in_lilla || '0',
						'Enabled in Offline': row.is_active_in_offline_store || '0',
						'Enabled in Review': row.is_active_in_review || '0',
						'Enabled in Event Microsite': row.is_active_in_event_microsite || '0',
						'Enabled in Lilla Offline': row.is_active_in_offline_store_lilla || '0',
						'Enabled in Sociolla VN': row.is_active_in_sociolla_vn || '0',
						'Enabled in Offline VN': row.is_active_in_offline_store_vn || '0',
						'Enabled in Review VN': row.is_active_in_review_vn || '',
						'Enabled in Event Microsite VN': row.is_active_in_event_microsite_vn || '0',
						'Item Status': row.status_item || '',
						// complete_master_item
						'Product Complete Name': row.product_complete_name || '',
						'Brand Type': row.brand_type || '',
						Vendor: row.vendor || '',
						'Purchase Type': row.product_purchase_type || '',
						'BPOM Reg No.': row.bpom_reg_no || '',
						'BPOM Expired Date': row.bpom_expired_at || '',
						'Can be Purchased': row.can_be_purchased || '',
						'Created At': row.created_at
							? moment(new Date(row.created_at)).format('YYYY-MM-DD HH:mm:ss')
							: '',
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
	logger.info('Start jarvis inventory-management-stock');
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
		'Id Product Attribute',
		'Reference',
		'Ean 13',
		'Product Name',
		'Product Complete Name',
		'Attribute',
		'Brand',
		'Classification',
		'Category Default',
		'Tree Categories',
		'Dimension (Depth x Height x Width)',
		'Display Stock',
		'Reserved Stock',
		'Total Stock',
		'Pacman',
		'Odoo',
		'Incoming',
		'Shelf Location',
		'Avg 3 mos Sales',
		'Product Url Sociolla',
	];

	if (isReadCogs) {
		fields.splice(16, 0, 'Cogs');
	}

	if (isReadPrice) {
		fields.splice(18, 0, 'Price');
	}

	if (context.user.country === 'vn') {
		fields.push('Enabled in Sociolla VN');
		fields.push('Enabled in Offline VN');
		fields.push('Enabled in Review VN');
		fields.push('Enabled in Event Microsite VN');
		fields.push('Item Status');
	} else {
		fields.push('Enabled in Sociolla');
		fields.push('Enabled in Lilla');
		fields.push('Enabled in Offline');
		fields.push('Enabled in Review');
		fields.push('Enabled in Lilla Offline');
		fields.push('Enabled in Event Microsite');
		fields.push('Item Status');
	}

	if (document?.report_type === 'complete_master_item') {
		fields.push('Brand Type');
		fields.push('Vendor');
		fields.push('Purchase Type');
		fields.push('BPOM Reg No.');
		fields.push('BPOM Expired Date');
		fields.push('Can be Purchased');
		fields.push('Created At');
	} else {
		fields.splice(5, 1);
	}

	// Create Temporary Table for processing data
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
	const task = new ExportInventoryManagementStock({
		limit: 1000,
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
			subject: 'Jarvis : Export Inventory Management Stock',
		});
		await client.connectDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
