'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
const CommonHelper = require('../../helpers/commonHelper');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'b2c-promotion-voucher' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CPromotionVoucher extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-promotion-voucher');
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
			const query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY id_voucher DESC LIMIT ${limit} OFFSET ${offset}`;
			return this.options.clientConnection.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				rows.forEach((row) => {
					self.options.csv.push({
						'Voucher Code': row.voucher_code,
						'Voucher Name': row.voucher_name,
						'Qty Redeemed': row.qty_redeemed,
						'Nominal Redeemed': row.nominal_redeemed,
						'Value Redeemed': row.value_redeemed,
						Quota: row.quota,
						ROI: parseFloat(row.roi).toFixed(2) + '%',
						AOV: parseInt(row.aov_before_voucher),
						'Redemption Rate': parseFloat(row.redemption_rate).toFixed(2) + '%',
						'Type of Voucher': row.type_of_voucher,
						'Operating Cost Type': row.operating_cost_type,
						'Amount Voucher': row.amount_voucher,
						Type: row.type,
						'Disc by Sociolla': row.disc_by_sociolla,
						'Disc By External': row.disc_by_brand,
						'Period Start': row.period_start
							? moment(new Date(row.period_start)).format('YYYY-MM-DD HH:mm:ss')
							: '',
						'Period End': row.period_end
							? moment(new Date(row.period_end)).format('YYYY-MM-DD HH:mm:ss')
							: '',
						'T&C': CommonHelper.slugify(row.tnc),
						'Period Redeemed':
							this.options.document.period === 'daily'
								? moment(new Date(row.order_date)).format('YYYY-MM-DD HH:mm:ss')
								: row.order_date,
						'Total Disc Sociolla': parseInt(row.total_disc_sociolla),
						'Total Disc Brand': parseInt(row.total_disc_brand),
					});
				});
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
	const isV2 = document?.isV2 ? 'V2' : '';
	const clientConnection = document?.isV2 ? client.connectNewDwh : client.connectDwh;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-promotion-voucher`);

	const outputFile = file_name;
	const fields = [
		'Voucher Code',
		'Voucher Name',
		'Qty Redeemed',
		'Nominal Redeemed',
		'Value Redeemed',
		'Quota',
		'ROI',
		'AOV',
		'Redemption Rate',
		'Type of Voucher',
		'Operating Cost Type',
		'Amount Voucher',
		'Type',
		'Disc by Sociolla',
		'Disc By External',
		'Period Start',
		'Period End',
		'T&C',
		'Period Redeemed',
		'Total Disc Sociolla',
		'Total Disc Brand',
	];

	// Create Temporary Table for processing data
	const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}}`,
	);
	const data = await Promise.resolve(clientConnection.query(queryRow));
	document.total = data?.rowCount || 0;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] TABLE ${document.tmp_table} CREATED`);

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CPromotionVoucher({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		document,
		file_name,
		csv: input,
		stopOnError: true,
		rejectOnError: true,
		clientConnection,
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
			subject: `Export B2C ${isV2} Promotion Voucher`,
		});
		await clientConnection.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
