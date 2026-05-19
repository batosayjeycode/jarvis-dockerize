'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const writeXlsxFile = require('write-excel-file/node');
const SES = require('sociolla-core/lib/aws/ses');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-inventory-management-onl-availability',
});
const workerHelpers = require('../../helpers/workerHelper');

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
	const clientMongoDB = message.clientMongoDB;
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	const connEmailLogs = clientMongoDB.db(process.env.MS_SOCIOLLA_MONGODB).collection('email_logs');
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis inventory-management-onl-availability`,
	);

	return Q.try(() => {
		const outputFile = file_name;
		const { queryRow: data_onl, queryCount: grandtotal } = criteria;
		const generateEmptyObj = (len = 1, obj = {}) => {
			const res = [];
			for (let i = 0; i < len; i++) {
				res.push(obj);
			}
			return res;
		};
		const emptyObjRow1 = generateEmptyObj(15);
		const emptyObjRow2 = generateEmptyObj(9);
		const emptyObjRow3 = generateEmptyObj(15, { width: 20 });
		// columnd width settings
		const columns = [...emptyObjRow3];
		// Header Value list
		const header = [
			'ID Product',
			'Brand Type',
			'Parent Category',
			'Brand',
			'Barcode',
			'Refcode',
			'Description',
			'Status',
			'Location',
			'Standard stock',
			'ONL Stock',
			'% Availibility',
			'% OOS',
			'OOS volume',
			'Tree Category',
		];
		// Field value list
		const fieldValue = [
			'id_product',
			'brand_type',
			'parent_category',
			'brand',
			'ean13',
			'reference',
			'description',
			'status_item',
			'location',
			'standar_stock',
			'stock',
			'availibility_percentage',
			'oos_percentage',
			'oos_volume',
			'tree_categories',
		];
		const headerValue = header.map((el) => {
			const bgcolor = ['Standard stock', 'ONL Stock', '% Availibility', '% OOS', 'OOS volume'].includes(el)
				? '#ffe598'
				: '#d9e2f3';

			return {
				value: el,
				fontWeight: 'bold',
				backgroundColor: bgcolor,
			};
		});
		const data = [
			[
				{
					value: `Scope:
					Sociolla VN Online (Web + Apps)
					Period ${moment().format('YYYY-MM-DD')}
					Single item products
					Active combination or active parent products
					Exclude GWP & Paper Bag`,
					fontWeight: 'bold',
				},
			],
			[...emptyObjRow1],
			[
				...emptyObjRow2,
				{
					value: grandtotal.standar_stock,
					backgroundColor: '#e2efd9',
					color: '#ff0000',
					borderColor: '#ff0000',
					fontWeight: 'bold',
					border: 'bold',
				},
				{
					value: grandtotal.stock,
					backgroundColor: '#e2efd9',
					color: '#ff0000',
					borderColor: '#ff0000',
					fontWeight: 'bold',
					border: 'bold',
				},
				{
					value: `${parseFloat(grandtotal.availibility_percentage).toFixed(2)}`,
					backgroundColor: '#e2efd9',
					color: '#ff0000',
					borderColor: '#ff0000',
					fontWeight: 'bold',
					border: 'bold',
				},
				{
					value: parseFloat(grandtotal.oos_percentage).toFixed(2),
					backgroundColor: '#e2efd9',
					color: '#ff0000',
					borderColor: '#ff0000',
					fontWeight: 'bold',
					border: 'bold',
				},
				{
					value: grandtotal.oos_volume,
					backgroundColor: '#e2efd9',
					color: '#ff0000',
					borderColor: '#ff0000',
					fontWeight: 'bold',
					border: 'bold',
				},
			],
			[...headerValue],
		];
		const genFieldValue = (obj) => {
			return fieldValue.map((el) => {
				return {
					value: ['availibility_percentage', 'oos_percentage'].includes(el)
						? parseFloat(obj[el]).toFixed(2)
						: obj[el],
				};
			});
		};

		data_onl.forEach((row) => {
			const genFieldVal = genFieldValue(row);
			data.push([...genFieldVal]);
		});

		return writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			orientation: 'landscape',
		})
			.then(() => {
				logger.info(`[${context?.user?.name} - ${context?.user?.email}] Finish insert to CSV`);
				return S3.upload({
					path: process.env.JARVIS_S3_PATH,
					fileName: outputFile,
					fileData: fs.createReadStream(outputFile),
					contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					isReplaceFile: true,
				});
			})
			.then((result) => {
				const cdnUrl = result.cdn_url ? result.cdn_url : result.url;
				logger.info(`[${context?.user?.name} - ${context?.user?.email}] cdnUrl: ${cdnUrl}`);
				const subjectEmail = 'Jarvis : Export Inventory Management - ONL Availability';
				const emailTo = criteria.send_to_email;

				return SES.sendEmail(
					{
						to: emailTo,
						from: process.env.SES_GMAIL_MAIL_JARVIS,
						sparkPostOption: { options: { click_tracking: false } },
						subject: subjectEmail,
						html: `<a href="${cdnUrl}" rel="notrack">Download Here</a>`,
					},
					'mail_jet',
					true,
				)
					.then(() => {
						return connEmailLogs.insertOne({
							subject: subjectEmail,
							recipient_email: [emailTo],
							status: 'success',
							reason: 'Url :' + cdnUrl,
							created_at: new Date(),
						});
					})
					.catch((err) => {
						return connEmailLogs
							.insertOne({
								subject: subjectEmail,
								recipient_email: [emailTo],
								status: 'failure',
								reason: 'Error :' + err,
								created_at: new Date(),
							})
							.then(() => {
								throw err;
							});
					});
			})
			.then(() => {
				logger.info(`[${context?.user?.name} - ${context?.user?.email}] Email sent successfully!`);
				const file_stats = fs.statSync(outputFile);
				const log_params = {
					...context.log_params,
					filesize: file_stats?.size || 0,
					created_at: new Date(),
					updated_at: new Date(),
				};

				return clientJarvis.db(process.env.JARVIS_MONGODB).collection('user_logs').insertOne(log_params);
			})
			.catch((err) => {
				throw err;
			})
			.finally(() => {
				fs.rmSync(outputFile, { force: true });
			});
	});
};
