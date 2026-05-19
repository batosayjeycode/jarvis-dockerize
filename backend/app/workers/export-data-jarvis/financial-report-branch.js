'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-financial-report-branch' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportFinancialReportBranch extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-financial-report-branch');
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
			const grand_total_q = `SELECT SUM(qty) AS qty, SUM(total_sales_actual) AS total_sales_actual, SUM(revenue_amount) AS revenue_amount, SUM(total_discount) AS total_discount, SUM(total_voucher_amount) AS total_voucher_amount, SUM(avg_cost) AS avg_cost FROM (${this.options.queryRow}) as grands`;
			const target_sales = this.options.additionQuery;
			return Q.all([
				this.options.client.connectDwh.query(query),
				this.options.client.connectDwh.query(grand_total_q),
				this.options.client.connectDwh.query(target_sales),
			]);
		})
			.then(([result, grandTotal, resultTarget]) => {
				const data = {};
				const grand_total = {};
				const data_total = grandTotal.rows[0];
				const params = this.options.document;
				const results = [];

				grand_total['qty'] = data_total.qty || 0;
				grand_total['total_sales_actual'] = data_total.total_sales_actual || 0;
				grand_total['revenue_amount'] = parseInt(data_total.revenue_amount);
				grand_total['revenue_amount_percentage'] = 100;
				grand_total['total_discount'] = parseInt(data_total.total_discount) / 1.1;
				grand_total['total_voucher_amount'] = data_total.total_voucher_amount;
				grand_total['target'] = 0;
				grand_total['avg_cost'] = parseFloat(data_total.avg_cost);

				result.rows.forEach((row) => {
					if (row.date) {
						data[row.id_branch] = {
							...data[row.id_branch],
							id_branch: row.id_branch,
							branch: row.branch_name,
							date: row.date,
							total_sales_actual: parseInt(row.total_sales_actual),
							revenue_amount: parseInt(row.revenue_amount),
							qty: row.qty,
							avg_cost: row.avg_cost,
							total_voucher_amount: parseInt(row.total_voucher_amount),
							total_discount: parseInt(row.total_discount),
							contribution: (parseInt(row.total_sales_actual) / grand_total.total_sales_actual) * 100,
						};
					}
				});

				if (resultTarget.rows && resultTarget.rows.length) {
					resultTarget.rows.map((row) => {
						const target =
							params.value_mode === 'before-discount'
								? parseInt(row.target_value_before_discount)
								: parseInt(row.target_value_after_discount);
						if (data[row.id_item]) {
							data[row.id_item] = {
								...data[row.id_item],
								target: target,
								total_sales_percentage:
									target && target > 0 ? (data[row.id_item].total_sales_actual / target) * 100 : 0,
							};
						}
						grand_total['target'] += parseInt(target);
					});
				}

				for (const row in data) {
					data[row].revenue_amount_percentage = data[row].revenue_amount ? 100 : 0;
					data[row].total_voucher_percentage = data[row].total_voucher_amount
						? `${Math.round((data[row].total_voucher_amount / data[row].revenue_amount) * 100)}`
						: 0;
					data[row].total_discount_percentage = data[row].total_discount
						? `${Math.round((data[row].total_discount / data[row].revenue_amount) * 100)}`
						: 0;

					if (data[row].avg_cost) {
						data[row].gp1_amount = data[row].revenue_amount - parseInt(data[row].avg_cost);
						data[row].gp1_percent = data[row].gp1_amount
							? `${Math.round((data[row].gp1_amount / data[row].revenue_amount) * 100)}`
							: 0;

						data[row].gp2_amount =
							data[row].gp1_amount - data[row].total_discount - (data[row].total_voucher_amount || 0);

						data[row].gp2_percent = data[row].gp2_amount
							? `${Math.round((data[row].gp2_amount / data[row].revenue_amount) * 100)}`
							: 0;
					}

					results.push(data[row]);
				}
				for (const res of results) {
					self.options.csv.push({
						'id branch': res.id_branch || '',
						branch: res.branch || '',
						target: res.target || '',
						'actual sales': res.total_sales_actual || '',
						'actual sales percent': res.total_sales_percentage || '0%',
						contribution: res.contribution ? `${res.contribution.toFixed(2)}%` : '',
						'revenue amount': res.revenue_amount || '',
						'revenue amount percent': res.revenue_amount_percentage || '',
						'gp1 amount': res.gp1_amount || '',
						'gp1 percent': res.gp1_percent || '',
						'disc amount': res.total_discount || '',
						'disc percent': res.total_discount_percentage || '',
						'voucher amount': res.total_voucher_amount || '',
						'voucher percent': res.total_voucher_percentage || '',
						'gp2 amount': res.gp2_amount || '',
						'gp2 percent': res.gp2_percent || '',
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-financial-report-branch`);

	const outputFile = file_name;
	const fields = [
		'id branch',
		'branch',
		'target',
		'actual sales',
		'actual sales percent',
		'contribution',
		'revenue amount',
		'revenue amount percent',
		'gp1 amount',
		'gp1 percent',
		'disc amount',
		'disc percent',
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
	const task = new ExportFinancialReportBranch({
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
			subject: 'Jarvis : Export Financial Report Branch',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
