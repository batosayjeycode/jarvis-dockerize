'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'soco-userinfo-registered' });
const { Readable } = require('stream');
const CommonHelper = require('../../helpers/commonHelper');
const moment = require('moment');
const workerHelpers = require('../../helpers/workerHelper');

let isShowEmailCustomer = false;

class ExportSocoUserinfoRegistered extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-soco-userinfo-registered');
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
				const rows = result.rows || [];
				for (const row of rows) {
					const obj = {
						'Registered At': row.registered_at
							? moment(row.registered_at).format('YYYY-MM-DD HH:mm:ss')
							: '-',
						'Registered From': row.registered_from,
						'Id Customer': row.id_customer,
						Email: row.email,
						'Customer Level': row.customer_level,
						'SOCO Points Redeemable': row.soco_points,
						'SP Gained From Activity': row.total_contribution_point || 0,
						'SP Gained From Transaction': row.total_order_point || 0,
						'Redeemed SP': row.total_redeem_point || 0,
						'Completed Beaty Profile': row.completed_beaty_profile,
						'Completed At': row.completed_at ? moment(row.completed_at).format('YYYY-MM-DD HH:mm:ss') : '-',
						'UTM Source': row.utm_source || '-',
						'UTM Medium': row.utm_medium || '-',
						'UTM Campaign': row.utm_campaign || '-',
						'BA Code / Cashier': row.ba_code || '',
						'is Exclusion': row.is_exclusion,
						'Lilla Membership Level': row.lilla_membership_level || '-',
						'Lilla Points Redeemable': row.lilla_points_redeemable || 0,
						'Redeemed LP': row.redeemed_lp || 0,
						'Is Verified Phone Number': row.is_verified_phone || '',
						'Is Verified Email': row.is_verified_email || '',
					};
					if (!isShowEmailCustomer) {
						delete obj['Email'];
					}
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis soco-userinfo-registered`);
	isShowEmailCustomer = CommonHelper.hasAccess(context, 'soco.user-info-registered', 'show-email-customer');

	const outputFile = file_name;
	const fields = [
		'Registered At',
		'Registered From',
		'Id Customer',
		'Email',
		'Customer Level',
		'Is Verified Phone Number',
		'Is Verified Email',
		'SOCO Points Redeemable',
		'SP Gained From Activity',
		'SP Gained From Transaction',
		'Redeemed SP',
		'Completed Beaty Profile',
		'Completed At',
		'UTM Source',
		'UTM Medium',
		'UTM Campaign',
		'BA Code / Cashier',
		'is Exclusion',
		'Lilla Membership Level',
		'Lilla Points Redeemable',
		'Redeemed LP',
	];
	if (!isShowEmailCustomer) {
		fields.splice(3, 1);
	}

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportSocoUserinfoRegistered({
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
			subject: 'Export Soco Userinfo Registered',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
