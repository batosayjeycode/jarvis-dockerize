'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-financial-report-brand' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportFinancialReportBrand extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-financial-report-brand');
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
			const query = `${this.options.queryRow.query_row} LIMIT ${limit} OFFSET ${offset}`;
			const grand_total_q = `SELECT SUM(qty) AS qty, SUM(total_sales_actual) AS total_sales_actual, SUM(revenue_amount) AS revenue_amount, SUM(total_discount) AS total_discount, SUM(avg_cost) AS avg_cost FROM (${this.options.queryRow.query_row}) as grands`;
			const target_sales = this.options.queryRow.target_sales;
			const voucher_sales = this.options.queryRow.voucher_sales;
			const discount_sales = this.options.queryRow.discount_sales;
			return Q.all([
				this.options.client.connectDwh.query(query),
				this.options.client.connectDwh.query(grand_total_q),
				this.options.client.connectDwh.query(target_sales),
				this.options.client.connectDwh.query(voucher_sales),
				this.options.client.connectDwh.query(discount_sales),
			]);
		})
			.then(([resultSales, grandTotal, resultTarget, resultVoucher, resultDiscount]) => {
				const grand_total = {
					qty: grandTotal.rows[0].qty || 0,
					total_sales_actual: grandTotal.rows[0].total_sales_actual || 0,
					revenue_amount: parseInt(grandTotal.rows[0].revenue_amount),
					disc_amount_sociolla: parseInt(grandTotal.rows[0].total_discount),
					disc_amount_brand: 0,
					total_voucher_amount: 0,
					target: 0,
					avg_cost: parseFloat(grandTotal.rows[0].avg_cost),
				};
				const data = {};
				const results = [];
				resultSales.rows.map((row) => {
					if (row.date) {
						const brand = row.brand;
						data[brand] = {
							...data[brand],
							brand: row.brand,
							date: row.date,
							brand_type: row.brand_type,
							total_sales_actual: row.total_sales_actual,
							revenue_amount: row.revenue_amount,
							qty: row.qty,
							avg_cost: row.avg_cost,
							disc_amount_sociolla: parseInt(row.total_discount),
							contribution: (row.total_sales_actual / grand_total.total_sales_actual) * 100,
						};
					}
				});

				if (resultTarget.rows && resultTarget.rows.length) {
					resultTarget.rows.map((row) => {
						const brand = row.brand;
						if (data[brand]) {
							const target = row.brand_type == 'internal' ? row.target_internal : row.target_external;
							data[brand] = {
								...data[brand],
								target: target,
								total_sales_percentage: target ? data[brand].total_sales_actual / target : '100%',
							};
						}
						grand_total['target'] += parseInt(row.target);
					});
				}

				if (resultVoucher.rows && resultVoucher.rows.length) {
					resultVoucher.rows.map((row) => {
						const brand = row.brand;
						if (data[brand]) {
							data[brand] = { ...data[brand], total_voucher_amount: row.total_voucher };
						}
						grand_total['total_voucher_amount'] += parseInt(row.total_voucher);
					});
				}

				if (resultDiscount.rows && resultDiscount.rows.length) {
					resultDiscount.rows.map((row) => {
						const brand = row.brand;
						if (data[brand]) {
							data[brand] = {
								...data[brand],
								disc_amount_sociolla:
									(data[brand]?.disc_amount_sociolla || 0) +
									parseInt(row.disc_amount_sociolla) / this.options.document.ppn,
								disc_amount_brand:
									(data[brand]?.disc_amount_brand || 0) +
									parseInt(row.disc_amount_brand) / this.options.document.ppn,
							};
						}
						grand_total['disc_amount_sociolla'] +=
							parseInt(row.disc_amount_sociolla) / this.options.document.ppn;
						grand_total['disc_amount_brand'] += parseInt(row.disc_amount_brand) / this.options.document.ppn;
					});
				}

				const keyObj = Object.keys(data);
				for (const row in keyObj) {
					data[`${keyObj[row]}`].revenue_amount_percentage = data[`${keyObj[row]}`].revenue_amount
						? '100%'
						: null;

					data[`${keyObj[row]}`].total_voucher_percentage = data[`${keyObj[row]}`].total_voucher_amount
						? `${Math.round(
								(parseInt(data[`${keyObj[row]}`].total_voucher_amount) /
									data[`${keyObj[row]}`].revenue_amount) *
									100,
							)}%`
						: null;
					data[`${keyObj[row]}`].disc_percent_sociolla = data[`${keyObj[row]}`].disc_amount_sociolla
						? `${Math.round(
								(parseInt(data[`${keyObj[row]}`].disc_amount_sociolla) /
									data[`${keyObj[row]}`].revenue_amount) *
									100,
							)}%`
						: null;
					data[`${keyObj[row]}`].disc_percent_brand = data[`${keyObj[row]}`].disc_amount_brand
						? `${Math.round(
								(parseInt(data[`${keyObj[row]}`].disc_amount_brand) /
									data[`${keyObj[row]}`].revenue_amount) *
									100,
							)}%`
						: null;

					if (data[`${keyObj[row]}`].avg_cost) {
						data[`${keyObj[row]}`].gp1_amount =
							data[`${keyObj[row]}`].revenue_amount - data[`${keyObj[row]}`].avg_cost;
						data[`${keyObj[row]}`].gp1_percent = data[`${keyObj[row]}`].gp1_amount
							? `${Math.round(
									(data[`${keyObj[row]}`].gp1_amount / data[`${keyObj[row]}`].revenue_amount) * 100,
								)}%`
							: null;

						data[`${keyObj[row]}`].gp2_amount =
							data[`${keyObj[row]}`].gp1_amount -
							data[`${keyObj[row]}`].disc_amount_sociolla -
							data[`${keyObj[row]}`].total_voucher_amount;
						data[`${keyObj[row]}`].gp2_percent = data[`${keyObj[row]}`].gp2_amount
							? `${Math.round(
									(data[`${keyObj[row]}`].gp2_amount / data[`${keyObj[row]}`].revenue_amount) * 100,
								)}%`
							: null;
					}

					results.push(data[`${keyObj[row]}`]);
				}

				for (const result of results) {
					self.options.csv.push({
						brand: result.brand || '',
						'brand type': result.brand_type || '',
						target: result.target || '',
						'actual sales': result.total_sales_actual || '',
						'actual sales percent': result.total_sales_percentage || '100%',
						contribution: result.contribution ? `${result.contribution}%` : '',
						'revenue amount': result.revenue_amount || '',
						'revenue amount percent': result.revenue_amount_percentage || '',
						'gp1 amount': result.gp1_amount || '',
						'gp1 percent': result.gp1_percent || '',
						'disc by sociolla amount': result.disc_amount_sociolla || '',
						'disc by sociolla percent': result.disc_percent_sociolla || '',
						'disc by brand amount': result.disc_amount_brand || '',
						'disc by brand percent': result.disc_percent_brand || '',
						'voucher amount': result.total_voucher_amount || '',
						'voucher percent': result.total_voucher_percentage || '',
						'gp2 amount': result.gp2_amount || '',
						'gp2 percent': result.gp2_percent || '',
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-financial-report-brand`);

	const outputFile = file_name;
	const fields = [
		'brand',
		'brand type',
		'target',
		'actual sales',
		'actual sales percent',
		'contribution',
		'revenue amount',
		'revenue amount percent',
		'gp1 amount',
		'gp1 percent',
		'disc by sociolla amount',
		'disc by sociolla percent',
		'disc by brand amount',
		'disc by brand percent',
		'voucher amount',
		'voucher percent',
		'gp2 amount',
		'gp2 percent',
	];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportFinancialReportBrand({
		limit: 500,
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
		csv: input,
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
			subject: 'Jarvis : Export Financial Report Brand',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
