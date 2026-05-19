'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
const CommonHelper = require('../../helpers/commonHelper');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-sales-allorder' });
const workerHelpers = require('../../helpers/workerHelper');
let isShowEmailCustomer = false;

class ExportB2CSalesAllorder extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-sales-allorder');
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
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const voucherCode = row.voucher_name_applied;

					let addObj = {};
					if (
						this.options.document &&
						this.options.document.additional_field &&
						this.options.document.additional_field.length
					) {
						addObj = this.options.document.additional_field.reduce((acc, el) => {
							let tmp = '';
							const elSplt = el.split('.');
							let newKey = elSplt[0];
							if (el === 'all_order_b2c.fullfilment_type, all_order_b2c.fullfilment_name') {
								newKey = 'fullfilment_by';
							} else if (elSplt[1]) {
								newKey = elSplt[1];
							}

							if (newKey === 'fullfilment_by') {
								acc[newKey] =
									row['fullfilment_type'] && row['fullfilment_name']
										? `${row['fullfilment_type']} - ${row['fullfilment_name']}`
										: '';
							} else if (
								[
									'all_order_b2c.offlinestore_approval_code',
									'all_order_b2c.offlinestore_card_number',
								].includes(el)
							) {
								tmp = el.replace('all_order_b2c.offlinestore_', '');
								acc[tmp] = row[newKey] && row[newKey] == 0 ? "'" + row[newKey] : row[newKey] || '';
							} else if (
								[
									'all_order_b2c.fee_charge',
									'all_order_b2c.is_event',
									'all_order_b2c.is_sbwe',
									'all_order_b2c.claim_3pl',
									'all_order_b2c.is_clearance',
								].includes(el)
							) {
								acc[newKey] = row[newKey];
							} else {
								acc[newKey] = row[newKey] || '';
							}
							return acc;
						}, {});
					}
					const totalOrderVoucher = (row.total_order_voucher && parseInt(row.total_order_voucher)) || 0;
					const obj = {
						'Customer Unique Id': row.customer_unique_id || '',
						'Order Date': row.order_date_ori
							? moment(new Date(row.order_date_ori)).format('YYYY-MM-DD HH:mm:ss')
							: row.order_date_ori,
						'Order ID': row.id_order || '',
						Reference: row.reference || '',
						'Voucher Code': voucherCode || '',
						Payment: row.order_payment || '',
						Email: row.email || '',
						Province: row.delivery_province || '',
						City: row.delivery_city || '',
						'Total Paid': row.total_order_paid || '',
						'Before Discount': row.before_discount || '',
						'Total Voucher Amount': totalOrderVoucher || '',
						'Total Shipping': row.total_order_shipping || '',
						Status: row.order_state || '',
						'Is Manual Order': row.is_manual_order || '',
						Cashier: row.offlinestore_cashier || '',
						Platform: row.order_platform || '',
						'Store Name': row.offlinestore_store_name || '',
						'Shipped Date Ori': row.shipped_date_ori
							? moment(new Date(row.shipped_date_ori)).format('YYYY-MM-DD HH:mm:ss')
							: row.shipped_date_ori,
						'Delivered Date': row.delivered_date_ori
							? moment(new Date(row.delivered_date_ori)).format('YYYY-MM-DD HH:mm:ss')
							: row.delivered_date_ori,
						'BA code': row.offlinestore_ba_code || '',
						'Bill No': row.invoice_code || '',
						'Is Offline Guest': row.is_offlinestore_guest || '',
						'Refunded Amount': (row && row.total_refunded_amount) || '',
						'Refunded Quantity': (row && row.total_refunded_qty) || '',
						Reason: row.reason || '',
						'Order Type': row.order_type || '',
						Carrier: row.carrier || '',
						'Redeemed Point': row.redeemed_point || '',
						'Original Order ID': row.original_order_id ? "'" + row.original_order_id : '',
						'EDC Type': row.edc_type || '',
						'Is Reseller': row.is_reseller || '',
						'Merchant ID': row.offlinestore_merchant_id || '',
						'Terminal ID': row.offlinestore_terminal_id || '',
						'Bank Card Number': row.offlinestore_card_number || '',
						'Partial Refund Status': row.partial_refund_state || '',
						'Is BYOB': row.is_byob || '',
						...addObj,
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2c-sales-allorder`);

	if (document?.is_freebies) {
		logger.info(`[${context?.user?.name} - ${context?.user?.email}] Soco Freebies download csv order only`);
	}

	if (document) {
		logger.info(`[${context?.user?.name} - ${context?.user?.email}] params: ${JSON.stringify(document)}`);
	}

	isShowEmailCustomer = CommonHelper.hasAccess(context, 'b2c-sociolla.data-visibility', 'show-email-customer');

	const outputFile = file_name;
	let fields = [
		'Customer Unique Id',
		'Order Date',
		'Order ID',
		'Reference',
		'Voucher Code',
		'Payment',
		'Email',
		'Province',
		'City',
		'Total Paid',
		'Before Discount',
		'Total Voucher Amount',
		'Total Shipping',
		'Status',
		'Is Manual Order',
		'Cashier',
		'Platform',
		'Store Name',
		'Shipped Date Ori',
		'Delivered Date',
		'BA code',
		'Bill No',
		'Is Offline Guest',
		'Is Reseller',
		'Refunded Amount',
		'Refunded Quantity',
		'Reason',
		'Order Type',
		'Carrier',
		'Redeemed Point',
		'Original Order ID',
		'EDC Type',
		'Merchant ID',
		'Terminal ID',
		'Bank Card Number',
		'Partial Refund Status',
		'Is BYOB',
	];
	if (!isShowEmailCustomer) {
		fields.splice(6, 1);
	}

	if (document && document.additional_field && document.additional_field.length) {
		const addField = document.additional_field.map((el) => {
			const elSplt = el.split('.');
			let newKey = elSplt[0];
			if (el === 'all_order_b2c.fullfilment_type, all_order_b2c.fullfilment_name') {
				newKey = 'fullfilment_by';
			} else if (elSplt[1]) {
				newKey = elSplt[1];
			}

			if (el === 'logs.edit_reason') {
				newKey = 'reason';
			} else if (
				['all_order_b2c.offlinestore_approval_code', 'all_order_b2c.offlinestore_card_number'].includes(el)
			) {
				newKey = el.replace('all_order_b2c.offlinestore_', '');
			}
			return newKey;
		});
		fields = [...fields, ...addField];
	}

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CSalesAllorder({
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
			subject: 'Jarvis : Export B2C Sales All Order',
		});
		await client.connectDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
