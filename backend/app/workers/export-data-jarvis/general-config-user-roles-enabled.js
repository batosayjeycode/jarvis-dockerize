'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-general-config-user-roles-enabled' });
const workerHelpers = require('../../helpers/workerHelper');
const moment = require('moment-timezone');

class ExportGeneralConfigUserRoles extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-general-config-user-roles-enabled');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.queryCount
				? this.options.client
						.db(process.env.JARVIS_MONGODB)
						.collection('user_roles')
						.aggregate(this.options.queryCount)
						.toArray()
				: this.options.client
						.db(process.env.JARVIS_MONGODB)
						.collection('user_roles')
						.countDocuments({ ...this.options.document.filter, is_deleted: { $ne: true } });
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${
						result?.[0]?.count || result || 0
					}`,
				);
				return parseInt(result?.[0]?.count) || result || 0;
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
	processBatch(limit, offset) {
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const arrAgg = this.options.queryRow
				? [
						...this.options.queryRow,
						{
							$limit: parseInt(limit || 10) + parseInt(offset || 0),
						},
						{
							$skip: parseInt(offset || 0),
						},
					]
				: null;
			return arrAgg
				? this.options.client
						.db(process.env.JARVIS_MONGODB)
						.collection('user_roles')
						.aggregate(arrAgg)
						.toArray()
				: this.options.client
						.db(process.env.JARVIS_MONGODB)
						.collection('user_roles')
						.find({ ...this.options.document.filter, is_deleted: { $ne: true } })
						.project({ role_name: 1, role_desc: 1, role_permission: 1 })
						.limit(limit)
						.skip(offset)
						.toArray();
		})
			.then((result) => {
				const roleId = (result || []).map((el) => el._id);
				return roleId.length
					? this.options.client
							.db(process.env.JARVIS_MONGODB)
							.collection('users')
							.find({ role_id: { $in: roleId } })
							.project({
								id: 1,
								user_name: 1,
								user_email: 1,
								is_active: 1,
								role_name: 1,
								created_at: 1,
								role_permission: 1,
							})
							.toArray()
					: [];
			})
			.then((res) => {
				(res || []).forEach((el) => {
					const obj = Object.entries(this.options.fieldName).reduce((accu, [fieldKey, fieldName]) => {
						const hasDot = fieldName.includes('.');
						if (hasDot) {
							const splFieldName = fieldName.split('.');
							const tmpKey1 = splFieldName.slice(0, splFieldName.length - 1).join('.');
							const tmpKey2 = splFieldName[splFieldName.length - 1];
							accu[fieldKey] =
								el?.['role_permission']?.[tmpKey1]?.[tmpKey2] &&
								[1, '1'].includes(el['role_permission'][tmpKey1][tmpKey2])
									? 'TRUE'
									: 'FALSE';
						} else if (fieldName == 'created_at') {
							accu[fieldKey] = moment(el[fieldName]).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
						} else if (fieldName == 'is_active') {
							accu[fieldKey] = el[fieldName] ? 'active' : 'inactive';
						} else {
							accu[fieldKey] = el[fieldName];
						}
						return accu;
					}, {});
					this.options.csv.push(obj);
				});
				return true;
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

function getFilters({ criteria, is_count = false }) {
	let pipeline = null;
	const isSearchAccess = Object.keys(criteria.filter).some((key) => {
		return !['role_name', 'role_desc', 'is_deleted'].includes(key);
	});
	if (isSearchAccess) {
		const arrKeySearchAccess = Object.keys(criteria.filter).filter((key) => {
			return !['role_name', 'role_desc', 'is_deleted'].includes(key);
		});
		if (arrKeySearchAccess.length) {
			const mainKey = arrKeySearchAccess.reduce((accu, el) => {
				const tmp = el.split('.');
				const tmpName = tmp.slice(0, tmp.length - 1).join('.');
				if (!accu[tmpName]) {
					accu[tmpName] = [];
				}
				accu[tmpName].push({ [`${tmp[tmp.length - 1]}`]: criteria.filter[el] });
				return accu;
			}, {});
			const andMatch = [{ is_deleted: { $ne: true } }];
			if (criteria?.filter?.role_name) {
				andMatch.push({ role_name: criteria.filter.role_name });
			}
			if (criteria?.filter?.role_desc) {
				andMatch.push({ role_desc: criteria.filter.role_desc });
			}
			Object.keys(mainKey).forEach((keyVal) => {
				let elemMatchVal = {
					k: keyVal,
				};
				let statusFalseWithValue = {};
				let statusFalseWithExist = {};
				mainKey[keyVal].forEach((elMain) => {
					Object.entries(elMain).forEach(([key, val]) => {
						if (val != 1) {
							statusFalseWithValue = {
								...statusFalseWithValue,
								[`v.${key}`]: {
									$in: [0, '0'],
								},
							};
							statusFalseWithExist = {
								...statusFalseWithExist,
								[`v.${key}`]: {
									$exists: false,
								},
							};
						} else {
							elemMatchVal = {
								...elemMatchVal,
								[`v.${key}`]: {
									$in: [1, '1'],
								},
							};
						}
					});
				});
				if (Object.keys(statusFalseWithValue).length || Object.keys(statusFalseWithExist).length) {
					elemMatchVal = {
						...elemMatchVal,
						$or: [],
					};
					if (Object.keys(statusFalseWithValue).length) {
						elemMatchVal.$or.push(statusFalseWithValue);
					}
					if (Object.keys(statusFalseWithExist).length) {
						elemMatchVal.$or.push(statusFalseWithExist);
					}
				}
				andMatch.push({
					rolepermissionarray: {
						$elemMatch: elemMatchVal,
					},
				});
			});
			pipeline = [
				{
					$addFields: {
						rolepermissionarray: {
							$objectToArray: '$role_permission',
						},
					},
				},
				{
					$match: {
						$and: andMatch,
					},
				},
				{
					$project: {
						role_name: 1,
						role_desc: 1,
						role_permission: 1,
					},
				},
			];
			if (is_count) {
				pipeline.push({
					$count: 'count',
				});
			}
		}
	}
	return pipeline;
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
	const clientJarvis = message.clientJarvis;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const file_name = message.data.file_name || null;
	if (document.filter) {
		document.filter = JSON.parse(JSON.stringify(document.filter));
	} else {
		document.filter = {};
	}
	if (document.listMenuPermission) {
		document.listMenuPermission = JSON.parse(document.listMenuPermission);
	} else {
		document.listMenuPermission = {};
	}
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis general-config-user-roles-enabled`);

	const outputFile = file_name;
	const fieldName = {
		user_name: 'user_name',
		user_email: 'user_email',
		user_status: 'is_active',
		role_name: 'role_name',
		registered_at: 'created_at',
	};
	if (Object.keys(document.listMenuPermission).length) {
		Object.entries(document.listMenuPermission).forEach(([key, val]) => {
			const splitKey = key.split('.');
			val.forEach((el) => {
				const tmpKey = `${splitKey[splitKey.length - 1].replaceAll('-', ' ')} ${el.replaceAll('-', ' ')}`;
				fieldName[tmpKey] = `${key}.${el}`;
			});
		});
	}

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);

	const task = new ExportGeneralConfigUserRoles({
		limit: 500,
		offset: 0,
		queryCount: getFilters({ criteria: document, is_count: true }),
		queryRow: getFilters({ criteria: document }),
		context,
		client: clientJarvis,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		document,
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
			subject: 'Jarvis Export General Config User Roles Enabled',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
