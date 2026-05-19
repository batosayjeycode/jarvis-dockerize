'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'soco-userinfo-beautyprofile' });
const { Readable } = require('stream');
const CommonHelper = require('../../helpers/commonHelper');
const workerHelpers = require('../../helpers/workerHelper');

let isShowEmailCustomer = false;

class ExportSocoUserinfoBeautyprofile extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-soco-userinfo-beautyprofile');
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
						'Id Customer': row.id_customer,
						Email: row.email,
						Age: row.age,
						Gender: row.gender,
						Location: row.location,
						'Face Type': row.face_type,
						'Hair Color': row.hair_color,
						'Hair Condition': row.hair_condition,
						'Hair Length': row.hair_length,
						'Hair Type': row.hair_type,
						'Skin Color': row.skin_color,
						'Skin Condition': row.skin_condition,
						'Skin Type': row.skin_type,
						Undertone: row.undertone,
						'Favourite Look': row.favourite_look,
						'Favourite Topics': row.favourite_topics,
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis soco-userinfo-beautyprofile`);
	isShowEmailCustomer = CommonHelper.hasAccess(context, 'soco.beauty-profile', 'show-email-customer');

	const outputFile = file_name;
	const fields = [
		'Id Customer',
		'Email',
		'Age',
		'Gender',
		'Location',
		'Face Type',
		'Hair Color',
		'Hair Condition',
		'Hair Length',
		'Hair Type',
		'Skin Color',
		'Skin Condition',
		'Skin Type',
		'Undertone',
		'Favourite Look',
		'Favourite Topics',
	];
	if (!isShowEmailCustomer) {
		fields.splice(1, 1);
	}

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportSocoUserinfoBeautyprofile({
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
			subject: 'Export Soco Userinfo Beauty Profile',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
