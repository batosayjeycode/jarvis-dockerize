'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
const CommonHelper = require('../../../../helpers/commonHelper');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-b2c-sales-allorder' });
const workerHelpers = require('../../../../helpers/workerHelper');
let isShowEmailCustomer = false;

class ExportAllorders extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-b2c-sales-allorder');
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
			return this.options.client.connectNewDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (['order_date', 'shipped_date', 'delivered_date', 'birthday'].includes(el[1])) {
							row[el[1]] = row[el[1]]
								? moment(new Date(row[el[1]])).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss')
								: '';
						} else if (
							['original_order_id', 'offline_card_number', 'offline_approval_code'].includes(el[1])
						) {
							row[el[1]] = row[el[1]] ? "'" + row[el[1]] : '';
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis v2-b2c-sales-allorder`);
	isShowEmailCustomer = CommonHelper.hasAccess(context, 'b2c-sociolla.data-visibility', 'show-email-customer');

	const outputFile = file_name;
	const fieldName = {
		'Customer Unique Id': 'customer_unique_id',
		'Order Date': 'order_date',
		'Order ID': 'id_order',
		Reference: 'reference',
		'Marketplace Order Reference': 'original_order_id',
		'Voucher Code': 'voucher_name_applied',
		Payment: 'order_payment',
		Email: 'email',
		Province: 'delivery_province',
		City: 'delivery_city',
		'Total Paid': 'total_order_paid',
		'Before Discount': 'before_discount',
		'Total Voucher Amount': 'total_order_voucher',
		'Total Shipping': 'total_order_shipping',
		Status: 'order_state',
		'Is Manual Order': 'is_manual_order',
		Cashier: 'offlinestore_cashier',
		Platform: 'order_platform',
		'Store Name': 'offlinestore_store_name',
		'Shipped Date': 'shipped_date',
		'Delivered Date': 'delivered_date',
		'BA code': 'offlinestore_ba_code',
		'Bill No': 'invoice_code',
		'Is Offline Guest': 'is_offlinestore_guest',
		'Is Reseller': 'is_reseller',
		'Refunded Amount': 'refunded_amount',
		'Refunded Quantity': 'refunded_qty',
		Reason: 'reason',
		'Order Type': 'order_type',
		Carrier: 'carrier',
		'Redeemed Point': 'redeemed_point',
		'EDC Type': 'edc_type',
		'Merchant ID': 'offlinestore_merchant_id',
		'Terminal ID': 'offlinestore_terminal_id',
		'Bank Card Number': 'offlinestore_card_number',
		'Partial Refund Status': 'partial_refund_state',
		'Is BYOB': 'is_byob',
	};

	if (!isShowEmailCustomer) {
		delete fieldName['Email'];
	}

	if (document?.additional_field?.length) {
		const additionalField = document.additional_field.filter(
			(el) =>
				![
					'redeemed_point',
					'o.total_redeem_point',
					'o.order_type',
					// 'oi.product_price_rule_name',
					'oi.deduction_for_brand',
					'oi.deduction_for_sociolla',
					'oi.discount_for_sociolla',
				].includes(el),
		);
		additionalField.forEach((el) => {
			const findInfo = document.additionalFieldsList.find((elList) => elList.values === el);
			const keyInfoText = findInfo?.text || 'empty';
			const elSplit = el.split(',');
			elSplit.forEach((elNew) => {
				const splitEl = elNew.trim().split('.');
				const newKey = elSplit.length > 1 ? `${keyInfoText} ${splitEl[1] || splitEl[0]}` : keyInfoText;
				fieldName[newKey] = splitEl[1] || splitEl[0];
			});
		});
	}

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportAllorders({
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
		fieldName,
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
			subject: 'Jarvis : Export V2 B2C Sales All Order',
		});
		await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
