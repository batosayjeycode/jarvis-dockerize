'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-sales-stock-cover' });
const workerHelpers = require('../../helpers/workerHelper');
let YEAR = null;
let LASTYEAR = null;

class ExportSalesStockCover extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-sales-stock-cover');
	}
	getTotalCount() {
		return 2000;
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = this.options.queryRow;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const tv = this.options.timeValues;
				const res = {};
				result.rows.map((row) => {
					const key = `${row.product_id}_${
						(row.product_attribute && row.product_attribute.replace(/\s+/g, '_').replace(/[^\w-]+/g, '')) ||
						''
					}_${(row.location && row.location.toLowerCase()) || ''}`;
					const period = moment(row.period).format('MMM-YYYY');
					const eom = moment(row.eom).format('DD');

					res[key] = {
						...res[key],
						product_id: row.product_id,
						product_name: row.product_name,
						product_attribute: row.product_attribute,
						brand: row.brand,
						reference: row.reference,
						ean13: row.ean13,
						category_default: row.category_default,
						parent_category: row.parent_category,
						child_category: row.child_category,
						grandchild_category: row.grandchild_category,
						location: row.location,
						store_name_team: row.store_name_team,
						order_platform_channel: row.order_platform_channel,
						store_code: row.store_code,
						purchase_type: row.product_purchase_type,
					};
					res[key]['sales_' + period] = row.total_sales;
					res[key]['qty_' + period] = row.total_qty;
					res[key]['disc_' + period] = row.total_discount;
					res[key]['odoo_cogs_' + period] = row.odoo_cogs;
					res[key]['stock_value_' + period] = row.stock_value;
					res[key]['stock_qty_' + period] = row.stock_qty;
					res[key]['eom_stock_value_' + period] = row.eom_stock_value;
					res[key]['eom_stock_qty_' + period] = row.eom_stock_qty;
					res[key]['eom_stock_doi_' + period] = row.eom_stock_doi;
					res[key]['doi_qty_' + period] = parseInt(row.stock_qty / row.total_sales) * eom;

					/* RUMUS gp1 & gp2 from high-level-revenue avg_cost = ps.odoo_cogs * qty
					 * row.gp1_amount = row.revenue_amount - row.avg_cost
					 * row.gp2_amount = row.gp1_amount - row.disc_amount_sociolla - row.total_voucher_amount
					 */
					res[key]['GP1_' + period] = row.total_sales - row.odoo_cogs * row.total_qty;
					res[key]['GP2_' + period] =
						res[key]['GP1_' + period] - row.disc_by_sociolla - row.total_voucher_prorate;
				});

				const data = [];
				for (const row in res) {
					data.push(res[row]);
				}

				for (const row of data) {
					const obj = {
						REFERENCE_CODE: row.reference || '',
						EAN13: row.ean13 || '',
						PRODUCT_NAME: row.product_name || '',
						ATTRIBUTE: row.product_attribute || '',
						BRAND: row.brand || '',
						PARENT_CATEGORY: row.parent_category || '',
						CHILD_CATEGORY: row.child_category || '',
						GRAND_CHILD_CATEGORY: row.grandchild_category || '',
						PURCHASE_TYPE: row.purchase_type || '',
						REGULAR_SEASONAL: row.REGULAR_SEASONAL || '',
						RETURN_POLICY: row.RETURN_POLICY || '',
						LOCATION: row.location || '',
						ORDER_PLATFORM_CHANNEL: row.order_platform_channel || '',
						STORE_NAME_TEAM: row.store_name_team || '',
						STORE_CODE: row.store_code || '',
						SALES_TOTAL: 0,
					};

					tv.forEach((rows) => {
						const str = rows.substring(rows.length - 4, rows.length);
						if (str == YEAR) {
							obj['SALES_' + rows] = rows['sales_' + rows] || 0;
							obj.SALES_TOTAL += obj['SALES_' + rows];
						}
					});
					obj.QTY_TOTAL = 0;
					tv.forEach((val) => {
						const str = val.substring(val.length - 4, val.length);
						if (str == YEAR) {
							obj['QTY_' + val] = val['qty_' + val] || 0;
							obj.QTY_TOTAL += obj['QTY_' + val];
						}
					});
					obj.YTD_TY_GP1 = 0;
					tv.forEach((vals) => {
						const str = vals.substring(vals.length - 4, vals.length);
						if (str == YEAR) {
							obj['GP1_' + vals] = vals['GP1_' + vals] || 0;
							obj.YTD_TY_GP1 += obj['GP1_' + vals];
						}
					});
					obj.YTD_TY_GP2 = 0;
					tv.forEach((value) => {
						const str = value.substring(value.length - 4, value.length);
						if (str == YEAR) {
							obj['GP2_' + value] = value['GP2_' + value] || 0;
							obj.YTD_TY_GP2 += obj['GP2_' + value];
						}
					});
					tv.forEach((values) => {
						const str = values.substring(values.length - 4, values.length);
						if (str == YEAR) {
							obj['STOCK_VALUE_' + values] = values['stock_value_' + values] || 0;
						}
					});
					tv.forEach((s) => {
						const str = s.substring(s.length - 4, s.length);
						if (str == YEAR) {
							obj['STOCK_QTY_' + s] = s['stock_qty_' + s] || 0;
						}
					});
					tv.forEach((r) => {
						const str = r.substring(r.length - 4, r.length);
						if (str == YEAR) {
							obj['DOI_QTY_' + r] = r['doi_qty_' + r] || 0;
						}
					});
					obj.LAST_YEAR_FULL = 0;
					tv.forEach((d) => {
						const str = d.substring(d.length - 4, d.length);
						if (str == LASTYEAR) {
							obj['LY_SALES_' + d] = d['sales_' + d] || 0;
							obj.LAST_YEAR_FULL += obj['LY_SALES_' + d];
						}
					});
					obj.LY_QTY = 0;
					tv.forEach((p) => {
						const str = p.substring(p.length - 4, p.length);
						if (str == LASTYEAR) {
							obj['LY_QTY_' + p] = p['qty_' + p] || 0;
							obj.LY_QTY += obj['LY_QTY_' + p];
						}
					});
					obj.LY_GP = 0;
					tv.forEach((l) => {
						const str = l.substring(l.length - 4, l.length);
						if (str == LASTYEAR) {
							obj['LY_GP_' + l] = l['GP1_' + l] || 0;
							obj.LY_GP += obj['LY_GP_' + l];
						}
					});
					obj.LY_GP2 = 0;
					tv.forEach((m) => {
						const str = m.substring(m.length - 4, m.length);
						if (str == LASTYEAR) {
							obj['LY_GP2_' + m] = m['GP2_' + m] || 0;
							obj.LY_GP2 += obj['LY_GP2_' + m];
						}
					});

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
	logger.info('Start jarvis export-sales-stock-cover');
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
	const file_name = message.data.file_name || null;
	YEAR = moment().format('YYYY');
	LASTYEAR = moment().subtract(1, 'year').format('YYYY');

	const outputFile = file_name;
	const fields = [
		'REFERENCE_CODE',
		'EAN13',
		'PRODUCT_NAME',
		'ATTRIBUTE',
		'BRAND',
		'PARENT_CATEGORY',
		'CHILD_CATEGORY',
		'GRAND_CHILD_CATEGORY',
		'PURCHASE_TYPE',
		'REGULAR_SEASONAL',
		'RETURN_POLICY',
		'LOCATION',
		'ORDER_PLATFORM_CHANNEL',
		'STORE_NAME_TEAM',
		'STORE_CODE',
		'SALES_TOTAL',
	];
	const dateStart = moment(document.start_date);
	const dateEnd = moment(document.end_date);
	const timeValues = [];
	if (dateStart <= dateEnd) {
		const date = dateStart.startOf('month');
		while (date < dateEnd.endOf('month')) {
			timeValues.push(date.format('MMM-YYYY'));
			date.add(1, 'month');
		}
	}

	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == YEAR) {
			fields.push('SALES_' + row);
		}
	});
	fields.push('QTY_TOTAL');
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == YEAR) {
			fields.push('QTY_' + row);
		}
	});
	fields.push('YTD_TY_GP1');
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == YEAR) {
			fields.push('GP1_' + row);
		}
	});
	fields.push('YTD_TY_GP2');
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == YEAR) {
			fields.push('GP2_' + row);
		}
	});
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == YEAR) {
			fields.push('STOCK_VALUE_' + row);
		}
	});
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == YEAR) {
			fields.push('STOCK_QTY_' + row);
		}
	});
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == YEAR) {
			fields.push('DOI_QTY_' + row);
		}
	});
	fields.push('LAST_YEAR_FULL');
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == LASTYEAR) {
			fields.push('LY_SALES_' + row);
		}
	});
	fields.push('LY_QTY');
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == LASTYEAR) {
			fields.push('LY_QTY_' + row);
		}
	});
	fields.push('LY_GP');
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == LASTYEAR) {
			fields.push('LY_GP_' + row);
		}
	});
	fields.push('LY_GP2');
	timeValues.forEach((row) => {
		const str = row.substring(row.length - 4, row.length);
		if (str == LASTYEAR) {
			fields.push('LY_GP2_' + row);
		}
	});

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportSalesStockCover({
		limit: 1000,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		additionQuery: criteria.additionQuery,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		fields: fields,
		timeValues: timeValues,
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
			subject: 'Jarvis : Export Sales & Stock Days Cover',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
