'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment-timezone');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-promotion-support' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CPromotionSupport extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-promotion-support');
	}
	getTotalCount() {
		return Q.try(() => {
			if (this.options.document.isV2) {
				return this?.options?.document?.total;
			}
			return this.options.client.connectDwh.query(this.options.queryCount);
		}).then((result) => {
			if (this.options.document.isV2) {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result}`,
				);
				return result;
			}
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
			);
			return parseInt(result.rows[0].total);
		});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			if (this.options.document.isV2) {
				const queryTmp = `SELECT * FROM ${this.options.document.tmp_table} LIMIT ${limit} OFFSET ${offset}`;
				return this.options.client.connectNewDwh.query(queryTmp);
			}
			let query = `WITH margin as (${this.options?.document?.all_query?.queryMargin}), sub as (${this.options?.document?.all_query?.querySub}), main as (${this.options?.document?.all_query?.queryMain} LIMIT ${limit} OFFSET ${offset}), all_data as (${this.options?.document?.all_query?.queryAllData}) select * from all_data`;

			if (this.options?.document?.report_type === 'sales_report_cerebro') {
				query = `${this.options.document?.query_row_cerebro} LIMIT ${limit} OFFSET ${offset}`;
			} else if (this.options?.document?.report_type === 'support_promo_summary') {
				query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			}

			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				let rows = result.rows || [];
				for (const row of rows) {
					self.options.csv.push({
						'ID Product': row?.id_product,
						Brand: row?.brand,
						SKU: row?.reference,
						Details: row?.product_name,
						'Shades or Combination': (row?.product_attribute || '')
							.replace(/\s+/g, ' ')
							.replace(/[^\w-]+/g, ' '),
						'Product Classification': row?.product_classification,
						'Base Price': row?.base_price,
						'Deduction For Brand': row?.deduction_for_brand,
						'Deduction For Sociolla': row?.deduction_for_sociolla,
						'Deduction Type': row?.deduction_type,
						'Price Rule Name': row?.price_rule_name,
						'Campaign Period Start': row?.campaign_period_start
							? (this.options.document.isV2
									? moment(row?.campaign_period_start)
									: moment(row?.campaign_period_start).tz('Asia/Jakarta')
								).format('YYYY-MM-DD HH:mm:ss')
							: '',
						'Campaign Period End': row?.campaign_period_end
							? (this.options.document.isV2
									? moment(row?.campaign_period_end)
									: moment(row?.campaign_period_end).tz('Asia/Jakarta')
								).format('YYYY-MM-DD HH:mm:ss')
							: '',
						'Selling Price': row?.selling_price,
						Margin: row?.margin,
						'Cost Price': row?.cost_price,
						'Qty Sales Online': row?.qty_sold_online,
						'Qty Sales Online Lilla': row?.qty_sold_online_lilla || 0,
						'Qty Sales Offline': row?.qty_sold_offline,
						'Qty Sales Offline Lilla': row?.qty_sold_offline_lilla || 0,
						'Total Sales Online': row?.total_sales_online,
						'Total Sales Online Lilla': row?.total_sales_online_lilla || 0,
						'Total Sales Offline': row?.total_sales_offline,
						'Total Sales Offline Lilla': row?.total_sales_offline_lilla || 0,
						'Total Cost Online': row?.total_cost_online,
						'Total Cost Online Lilla': row?.total_cost_online_lilla || 0,
						'Total Cost Offline': row?.total_cost_offline,
						'Total Cost Offline Lilla': row?.total_cost_offline_lilla || 0,
						'Total Sales': row?.total_sales,
						'Total Cost': row?.total_cost,
						'Total QTY': row?.total_qty,
						'Total Support Promo Online': row?.support_promo_online,
						'Total Support Promo Online Lilla': row?.support_promo_lilla || 0,
						'Total Support Promo Offline': row?.support_promo_offline,
						'Total Support Promo Offline Lilla': row?.support_promo_offline_lilla || 0,
						'Total Support Promo': row?.support_promo_total,
						'Qty Pack Online': row?.qty_bundle_online || 0,
						'Qty Pack Online Lilla': row?.qty_bundle_online_lilla || 0,
						'Qty Pack Offline': row?.qty_bundle_offline || 0,
						'Qty Pack Offline Lilla': row?.qty_bundle_offline_lilla || 0,
					});
				}
				result = null;
				rows = null;
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const isV2 = document?.isV2 ? 'V2' : '';
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-promotion-promo`);

	if (document) {
		logger.info(`[${context?.user?.name} - ${context?.user?.email}] params: ${JSON.stringify(document)}`);
	}

	const outputFile = file_name;
	let fields = [];
	if (document?.report_type === 'support_promo') {
		fields = [
			'ID Product',
			'Brand',
			'SKU',
			'Details',
			'Shades or Combination',
			'Product Classification',
			'Base Price',
			'Deduction For Brand',
			'Deduction For Sociolla',
			'Deduction Type',
			'Price Rule Name',
			'Campaign Period Start',
			'Campaign Period End',
			'Selling Price',
			'Qty Sales Online',
			'Qty Sales Online Lilla',
			'Qty Sales Offline',
			'Qty Sales Offline Lilla',
			'Total Sales Online',
			'Total Sales Online Lilla',
			'Total Sales Offline',
			'Total Sales Offline Lilla',
			'Total Support Promo Online',
			'Total Support Promo Online Lilla',
			'Total Support Promo Offline',
			'Total Support Promo Offline Lilla',
			'Total Sales',
			'Total Support Promo',
			'Total QTY',
		];
	} else if (document?.report_type === 'support_promo_summary') {
		fields = [
			'Brand',
			'SKU',
			'Details',
			'Product Classification',
			'Total Sales',
			'Total Cost',
			'Qty Sales Online',
			'Qty Sales Online Lilla',
			'Qty Sales Offline',
			'Qty Sales Offline Lilla',
			'Qty Pack Online',
			'Qty Pack Online Lilla',
			'Qty Pack Offline',
			'Qty Pack Offline Lilla',
			'Total QTY',
		];
	} else {
		fields = [
			'ID Product',
			'Brand',
			'SKU',
			'Details',
			'Shades or Combination',
			'Product Classification',
			'Base Price',
			'Deduction For Brand',
			'Deduction For Sociolla',
			'Deduction Type',
			'Price Rule Name',
			'Campaign Period Start',
			'Campaign Period End',
			'Selling Price',
			'Margin',
			'Cost Price',
			'Qty Sales Online',
			'Qty Sales Online Lilla',
			'Qty Sales Offline',
			'Qty Sales Offline Lilla',
			'Total Sales Online',
			'Total Sales Online Lilla',
			'Total Sales Offline',
			'Total Sales Offline Lilla',
			'Total Cost Online',
			'Total Cost Online Lilla',
			'Total Cost Offline',
			'Total Cost Offline Lilla',
			'Total Sales',
			'Total Cost',
			'Total QTY',
		];
	}
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);

	if (isV2) {
		// Create Temporary Table for processing data
		const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
		logger.info(
			`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}}`,
		);
		const data = await Promise.resolve(client.connectNewDwh.query(queryRow));
		document.total = data?.rowCount || 0;
		logger.info(`[${context?.user?.name} - ${context?.user?.email}] TABLE ${document.tmp_table} CREATED`);
	}

	const queryCount =
		document?.report_type === 'sales_report_cerebro' ? document?.query_count_cerebro : criteria.queryCount;
	const task = new ExportB2CPromotionSupport({
		limit: 500,
		offset: 0,
		queryCount,
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
			subject: `Export B2C ${isV2} Promotion Support`,
		});
		if (isV2) {
			await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
			logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
		}
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
