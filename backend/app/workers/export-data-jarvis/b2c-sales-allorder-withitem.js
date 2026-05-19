'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
const CommonHelper = require('../../helpers/commonHelper');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-sales-allorder-withitem' });
let isShowEmailCustomer = false;
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CSalesAllorderWithitem extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-sales-allorder-withitem');
	}
	getTotalCount() {
		logger.info(
			`${this.options.document.tmp_table}, total count: ${this.options.queryCount} by ${this.options.context?.user?.email} to ${this.options.email}`,
		);
		return Q.resolve(this.options.queryCount);
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`${this.options.document.tmp_table}, Querying LIMIT ${limit} OFFSET ${offset} by ${this.options.context?.user?.email} to ${this.options.email}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				logger.info(
					`${this.options.document.tmp_table}, Start insert CSV Processed ${limit} OFFSET ${offset} by ${this.options.context?.user?.email} to ${this.options.email}`,
				);
				for (const row of rows) {
					let voucherCode = '';
					if (row.voucher_name_applied && row.voucher_name_applied != '- | -') {
						const spltVoucherName = row.voucher_name_applied.split('|');
						voucherCode = (spltVoucherName && spltVoucherName.length && spltVoucherName[0]) || '';
					}

					let addObj = {};
					if (this.options?.document?.additional_field?.length) {
						addObj = this.options.document.additional_field.reduce((acc, el) => {
							let tmp = '';
							const elSplt = el.split('.');
							let newKey = elSplt[1] || elSplt[0];
							if (newKey === 'discount_name') {
								newKey = 'price_rule_name';
							} else if (el === 'all_order_b2c.fullfilment_type, all_order_b2c.fullfilment_name') {
								newKey = 'fullfilment_by';
							} else if (el === 'logs.edit_reason') {
								newKey = 'reason';
							} else if (
								[
									'all_order_b2c.offlinestore_approval_code',
									'all_order_b2c.offlinestore_card_number',
								].includes(el)
							) {
								tmp = el.replace('all_order_b2c.offlinestore_', '');
								acc[tmp] = row[newKey] && row[newKey][0] == 0 ? "'" + row[newKey] : row[newKey] || '';
							} else if (newKey === 'voucher_name') {
								newKey = 'special_price_voucher_name';
							}
							if (newKey === 'fullfilment_by') {
								acc[newKey] =
									row['fullfilment_type'] && row['fullfilment_name']
										? `${row['fullfilment_type']} - ${row['fullfilment_name']}`
										: '';
							} else if (newKey === 'original_order_id') {
								acc[newKey] = row[newKey] ? "'" + row[newKey] : '';
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

					const obj = {
						'Customer Unique Id': row.customer_unique_id || '',
						'Order Date': row.order_date_ori
							? moment(new Date(row.order_date_ori)).format('YYYY-MM-DD HH:mm:ss')
							: row.order_date_ori,
						'Id Order': row.id_order || '',
						Reference: row.reference || '',
						'Voucher Code': voucherCode || '',
						Payment: row.order_payment || '',
						Email: row.email || '',
						Province: row.delivery_province || '',
						City: row.delivery_city || '',
						'Total Paid': row.total_order_paid || '',
						'Before Discount': row.before_discount || '',
						'Total Voucher Amount': row.total_order_voucher || '',
						'Total Shipping': row.total_order_shipping || '',
						Status: row.order_state || '',
						'Is Manual Order': row.is_manual_order || '',
						Cashier: row.offlinestore_cashier || '',
						Platform: row.order_platform || '',
						'Store Name': row.offlinestore_store_name || '',
						'Shipped Date Ori': row.shipped_date_ori
							? moment(new Date(row.shipped_date_ori)).format('YYYY-MM-DD HH:mm:ss')
							: row.shipped_date_ori,
						'Delivered Date Ori': row.delivered_date_ori
							? moment(new Date(row.delivered_date_ori)).format('YYYY-MM-DD HH:mm:ss')
							: row.delivered_date_ori,
						'Id Product': row.id_product || '',
						'Product Reference': row.product_reference || '',
						'Product Name': row.product_name || '',
						'Id Product Attribute': row.id_product_attribute || '',
						'Product Attribute': row.product_attribute || '',
						Brand: row.brand || '',
						'Product Type': row.product_type || '',
						'Product Classification': row.product_classification || '',
						'Default Category': row.category_default || '',
						Qty: row.qty || '',
						'Base Price': row.value_original || '',
						Value: row.value || '',
						'Is Offline Guest': row.is_offlinestore_guest || '',
						'Bill No': row.invoice_code || '',
						'BA Code Order': row.offlinestore_ba_code || '',
						'BA Code Item': row.offlinestore_ba_code_item || '',
						'Refunded Amount': row.refunded_amount || '',
						'Refunded Quantity': row.refunded_quantity || '',
						'EDC Type': row.edc_type || '',
						'Is Reseller': row.is_reseller || '',
						'Partial Refund Status': row.partial_refund_state || '',
						'Original Order ID': row.original_order_id ? "'" + row.original_order_id : '',
						'Is BYOB': row.is_byob || '',
						...addObj,
					};
					if (!isShowEmailCustomer) {
						delete obj['Email'];
					}
					if (this.options.document.product_type === 'single') {
						obj['Virtual Bundle SKU'] = row.virtual_bundle_sku || '';
						obj['Bundle ID'] = row.id_bundle || '';
						obj['Bundle Attribute ID'] = row.id_bundle_attribute || '';
					}

					self.options.csv.push(obj);
				}
			})
			.then(() => {
				logger.info(
					`${this.options.document.tmp_table}, Done Processed ${offset} of ${this.options.queryCount} by ${this.options.context?.user?.email} to ${this.options.email}`,
				);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
}

module.exports = async (message) => {
	logger.info('Start jarvis b2c-sales-allorder-withitem');
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

	if (document?.is_freebies) {
		logger.info('Soco Freebies download csv with item');
	}

	if (document) {
		logger.info(`params: ${JSON.stringify(document)}`);
	}

	isShowEmailCustomer = CommonHelper.hasAccess(context, 'b2c-sociolla.data-visibility', 'show-email-customer');

	const outputFile = file_name;
	let fields = [
		'Customer Unique Id',
		'Order Date',
		'Id Order',
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
		'Delivered Date Ori',
		'Id Product',
		'Product Reference',
		'Product Name',
		'Id Product Attribute',
		'Product Attribute',
		'Brand',
		'Product Type',
		'Product Classification',
		'Default Category',
		'Qty',
		'Base Price',
		'Value',
		'Is Offline Guest',
		'Is Reseller',
		'Bill No',
		'BA Code Order',
		'BA Code Item',
		'Refunded Amount',
		'Refunded Quantity',
		'Original Order ID',
		'EDC Type',
		'Partial Refund Status',
		'Is BYOB',
	];
	if (!isShowEmailCustomer) {
		fields.splice(6, 1);
	}
	if (document.product_type === 'single') {
		fields.push('Virtual Bundle SKU');
		fields.push('Bundle ID');
		fields.push('Bundle Attribute ID');
	}

	if (document && document.additional_field && document.additional_field.length) {
		const addField = document.additional_field.map((el) => {
			const elSplt = el.split('.');
			let newKey = elSplt[1] || elSplt[0];
			if (newKey === 'discount_name') {
				newKey = 'price_rule_name';
			} else if (el === 'all_order_b2c.fullfilment_type, all_order_b2c.fullfilment_name') {
				newKey = 'fullfilment_by';
			} else if (el === 'logs.edit_reason') {
				newKey = 'reason';
			} else if (
				['all_order_b2c.offlinestore_approval_code', 'all_order_b2c.offlinestore_card_number'].includes(el)
			) {
				newKey = el.replace('all_order_b2c.offlinestore_', '');
			} else if (newKey === 'voucher_name') {
				newKey = 'special_price_voucher_name';
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
	const task = new ExportB2CSalesAllorderWithitem({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
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
			subject: 'Export B2C Sales All Order With Item',
		});
		await client.connectDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
