'use strict';

require('dotenv').config({ path: __dirname + '/../../../.env' });

const Q = require('q');
const { RabbitMq } = require('sociolla-core/lib/rabbitmq');
const Logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-jarvis',
});
const client = require('sociolla-core/lib/postgre');
const MongoClient = require('mongodb').MongoClient;
const clientMongoDB = new MongoClient(process.env.MS_SOCIOLLA_PUBLIC_API_MONGODB_URL);
const clientJarvis = new MongoClient(process.env.JARVIS_MONGODB_URL);
const clientAnalytics = new MongoClient(process.env.MS_ANALYTICS_MONGODB_URL);

const messageType = {
	'all-sociolla-sales-periode': './all-sociolla-sales-periode',
	'all-sociolla-sales-summary': './all-sociolla-sales-summary',
	'analytics-most-view-products': './analytics-most-view-products',
	'automation-query': './automation-query',
	'automation-query-aov-range': './automation-query-aov-range',
	'automation-query-gamification': './automation-query-gamification',
	'automation-query-gwp': './automation-query-gwp',
	'automation-query-product-review': './automation-query-product-review',
	'automation-query-search-keyword': './automation-query-search-keyword',
	'automation-query-socobox': './automation-query-socobox',
	'automation-query-top-sku': './automation-query-top-sku',
	'automation-query-user-review': './automation-query-user-review',
	'automation-query-voucher-usage': './automation-query-voucher-usage',
	'automation-query-wishlist': './automation-query-wishlist',
	'b2b-account-receiveable': './b2b-account-receiveable',
	'b2b-account-receiveable-detail': './b2b-account-receiveable-detail',
	'b2b-analysis-tools-sku-sold': './b2b-analysis-tools-sku-sold',
	'b2b-customer-late-payment': './b2b-customer-late-payment',
	'b2b-customer-late-payment-detail': './b2b-customer-late-payment-detail',
	'b2b-customer-purchase-trend': './b2b-customer-purchase-trend',
	'b2b-customer-service-level': './b2b-customer-service-level',
	'b2b-customer-service-level-detail': './b2b-customer-service-level-detail',
	'b2b-customerpurchase': './b2b-customerpurchase',
	'b2b-sales-allorder': './b2b-sales-allorder',
	'b2b-sales-allorder-withitem': './b2b-sales-allorder-withitem',
	'b2b-sales-commerce-report': './b2b-sales-commerce-report',
	'b2b-sales-doors': './b2b-sales-doors',
	'b2b-sales-periode': './b2b-sales-periode',
	'b2b-sales-summary': './b2b-sales-summary',
	'b2b-sales-targetsales': './b2b-sales-targetsales',
	'b2c-analysis-tools-cohort': './b2c-analysis-tools-cohort',
	'b2c-analysistools-posquickregistration-percashier': './b2c-analysistools-posquickregistration-percashier',
	'b2c-analysistools-posquickregistration-perstore': './b2c-analysistools-posquickregistration-perstore',
	'b2c-customerview': './b2c-customerview',
	'b2c-operation-order-tracker': './b2c-operation-order-tracker',
	'b2c-price-change-summary': './b2c-price-change-summary',
	'b2c-price-elasticity': './b2c-price-elasticity',
	'b2c-productwishlist': './b2c-productwishlist',
	'b2c-promotion-discount': './b2c-promotion-discount',
	'b2c-promotion-flashsale': './b2c-promotion-flashsale',
	'b2c-promotion-flashsale-items': './b2c-promotion-flashsale-items',
	'b2c-promotion-flashsale-orders': './b2c-promotion-flashsale-orders',
	'b2c-promotion-gwp': './b2c-promotion-gwp',
	'b2c-promotion-gwp-v2': './b2c-promotion-gwp-v2',
	'b2c-promotion-gwp-listorder': './b2c-promotion-gwp-listorder',
	'b2c-promotion-gwp-listorder-v2': './b2c-promotion-gwp-listorder-v2',
	'b2c-promotion-master-price-rule': './b2c-promotion-master-price-rule',
	'b2c-promotion-pwp': './b2c-promotion-pwp',
	'b2c-promotion-support': './b2c-promotion-support',
	'b2c-promotion-voucher': './b2c-promotion-voucher',
	'b2c-promotion-voucher-listorder': './b2c-promotion-voucher-listorder',
	'b2c-sales-allorder': './b2c-sales-allorder',
	'b2c-sales-allorder-withitem': './b2c-sales-allorder-withitem',
	'b2c-sales-giftcard': './b2c-sales-giftcard',
	'b2c-sales-masksubscription-order': './b2c-sales-masksubscription',
	'b2c-sales-masksubscription-package': './b2c-sales-masksubscription',
	'b2c-sales-periode': './b2c-sales-periode',
	'b2c-sales-summary': './b2c-sales-summary',
	'b2c-sales-summary-platform': './b2c-sales-summary-platform',
	'b2c-sales-summary-product': './b2c-sales-summary-product',
	'b2c-sales-summary-store': './b2c-sales-summary-store',
	'b2c-sales-tags': './b2c-sales-tags',
	'b2c-sales-targetsales': './b2c-sales-targetsales',
	'extra-bag-order': './extra-bag-order',
	'financial-report-offline-store-revenue': './financial-report-offline-store-revenue',
	'financial-report-branch': './financial-report-branch',
	'financial-report-brand': './financial-report-brand',
	'financial-report-nmv-sales': './financial-report-nmv-sales',
	'financial-report-net-revenue': './financial-report-net-revenue',
	'financial-report-net-revenue-breakdown': './financial-report-net-revenue-breakdown',
	'financial-report-net-revenue-vn': './financial-report-net-revenue-vn',
	'financial-report-revenue-amount': './financial-report-revenue-amount',
	'general-config-currency-logs': './general-config-currency-logs',
	'general-config-user-logs': './general-config-user-logs',
	'general-config-user-roles': './general-config-user-roles',
	'general-config-user-roles-enabled': './general-config-user-roles-enabled',
	'general-config-users': './general-config-users',
	'gross-profit-brand': './gross-profit-brand',
	'gross-profit-sku': './gross-profit-sku',
	'inventory-management-absolute-variant': './inventory-management-absolute-variant',
	'inventory-management-alert-oos-offline': './inventory-management-alert-oos-offline',
	'inventory-management-inventory-value': './inventory-management-inventory-value',
	'inventory-management-onl-availability': './inventory-management-onl-availability',
	'inventory-management-oos': './inventory-management-oos',
	'inventory-management-slow-moving-sku': './inventory-management-slow-moving-sku',
	'inventory-management-stock': './inventory-management-stock',
	'inventory-management-stock-per-warehouse': './inventory-management-stock-per-warehouse',
	'inventory-management-tracking': './inventory-management-tracking',
	'v2-inventory-stock-report-summary': './v2/inventory-management/excel-stock-report-summary',
	'v2-inventory-stock-report-details': './v2/inventory-management/excel-stock-report-details',
	'mgm-vn-report': './mgm-vn-report',
	'moengage-export-csv': './moengage-export-csv',
	'nps-statistic-dashboard': './nps-statistic-dashboard',
	'nps-statistic-detail': './nps-statistic-detail',
	'offline-order-price-logs': './offline-order-price-logs',
	'omnichannel-all-order': './omnichannel-all-order',
	'omnichannel-all-order-with-item': './omnichannel-all-order-with-item',
	'regional-sales-period': './regional-sales-period',
	'sales-forecast-report': './sales-forecast-report',
	'sales-stock-cover': './sales-stock-cover',
	'scm-forecast-logs': './scm-forecast-logs',
	'sinclair-contribution-dashboard-brands': './sinclair-contribution-dashboard-brands',
	'sinclair-contribution-dashboard-categories': './sinclair-contribution-dashboard-categories',
	'sinclair-dashboard': './sinclair-dashboard',
	'sinclair-footfall': './sinclair-footfall',
	'soco-point-daily-redemption': './soco-point-daily-redemption',
	'soco-product-tags': './soco-product-tags',
	'soco-review': './soco-review',
	'soco-review-product': './soco-review-product',
	'soco-userinfo-beautyprofile': './soco-userinfo-beautyprofile',
	'soco-userinfo-registered': './soco-userinfo-registered',
	'store-detail-pov': './store-detail-pov',
	'store-summary-pov': './store-summary-pov',
	'supply-chain-management-forecast': './supply-chain-management-forecast',
	'support-helper-item-order-synced': './support-helper-item-order-synced',
	'top-reviewer-vn': './top-reviewer-vn',
	'total-review-vn': './total-review-vn',
	'user-churn-level': './user-churn-level',
	'b2c-analysistools-cancel-refund-detail': './b2c-analysistools-cancel-refund-detail',
	'b2c-analysistools-cancel-refund-detail-item': './b2c-analysistools-cancel-refund-detail-item',
	products: './products',
	'category-split': './category-split',
	'financial-report-store-by-store': './financial-report-store-by-store',
	'financial-report-store-by-total': './financial-report-store-by-total',
	'monthly-business-review': './monthly-business-review',
	'support-helper-order-synced': './support-helper-order-synced',
	'mbr-brand': './mbr-brand',
	'mbr-channel': './mbr-channel',
	'b2c-sales-allorder-detail': './b2c-sales-allorder-detail',
	'shopping-cart-cancellation-logs': './shopping-cart-cancellation-logs',
	'omnichannel-top-stores': './omnichannel-top-stores',
	'omnichannel-top-stores-all-order': './omnichannel-top-stores-all-order',
	'omnichannel-top-stores-all-order-with-item': './omnichannel-top-stores-all-order-with-item',
	'v2-b2c-allorder': './v2/b2c/all-orders',
	'v2-b2c-allorder-items': './v2/b2c/all-order-items',
	'database-lock-rules': './database-lock-rules',
	'excel-database-lock-rules': './excel-database-lock-rules',
	'db-lock-rules-logs': './db-lock-rules-logs',
	'excel-db-lock-rules-logs': './excel-db-lock-rules-logs',
	'product-sourcing-rules': './product-sourcing-rules',
	'excel-product-sourcing-rules': './excel-product-sourcing-rules',
	'product-sourcing-rules-logs': './product-sourcing-rules-logs',
	'excel-product-sourcing-rules-logs': './excel-product-sourcing-rules-logs',
	'bulk-insert-product-sourcing-rules': './bulk-insert-product-sourcing-rules',
	'bulk-update-product-sourcing-rules': './bulk-update-product-sourcing-rules',
	'v2-gross-profit-summaries': './v2/all/gross-profit-summaries',
	'v2-gross-profit-details': './v2/all/gross-profit-details',
	'v2-excel-gross-profit-summaries': './v2/all/excel-gross-profit-summaries',
	'v2-excel-gross-profit-details': './v2/all/excel-gross-profit-details',
	'v2-sales-operation-dashboard': './v2/b2c/sales-operation-dashboard',
	'v2-excel-sales-operation-dashboard': './v2/b2c/excel-sales-operation-dashboard',
	'v2-gift-card-details': './v2/b2c/gift-card-details',
	'v2-b2b-excel-sales-order-summaries': './v2/b2b/excel-sales-order-summaries',
	'v2-b2b-excel-sales-order-details': './v2/b2b/excel-sales-order-details',
	'v2-b2b-excel-sales-order-list': './v2/b2b/excel-sales-order-list',
	'v2-b2c-excel-top-sales': './v2/b2c/excel-top-sales',
	'v2-b2b-download-target-sales': './v2/b2b/excel-download-target-sales',
	'v2-b2b-upload-target-sales': './v2/b2b/upload-target-sales',
	'v2-b2b-excel-target-sales': './v2/b2b/excel-target-sales',
	'v2-excel-export-report-cart-product-log-delete': './v2/all/excel-export-report-cart-product-log-delete',
	'v2-excel-sinclair-sssg-rules': './v2/sinclair/excel-sssg-rules',
	'v2-excel-download-sinclair-sssg-rules': './v2/sinclair/excel-download-sssg-rules',
	'v2-sinclair-upload-sssg-rules': './v2/sinclair/upload-sssg-rules',
	'v2-b2c-excel-sales-summaries': './v2/b2c/excel-sales-summaries',
	'v2-b2c-excel-sales-summaries-details': './v2/b2c/excel-sales-summaries-details',
};

const connectDB = async () => {
	try {
		await Q.all([client.connect(), clientMongoDB.connect(), clientJarvis.connect(), clientAnalytics.connect()]);
		console.log('connected to db');
		RabbitMq.listenQueue('export-jarvis', function (message) {
			const logger = Logger.child({
				startTime: process.hrtime(),
				loggerContext: message.loggerContext || null,
			});
			logger.info({ functionContext: arguments }, 'Message received');
			return Q.try(() => {
				message.type = message.type || '';
				const connections = {
					client,
					clientMongoDB,
					clientJarvis,
					clientAnalytics,
					data: message,
				};
				require(messageType[message.type])(connections);
			})
				.catch((err) => {
					logger.error(err);
					throw err;
				})
				.finally(() => {
					logger.info({ responseTime: process.hrtime(logger.fields.startTime) }, 'Message processed');
				});
		});
	} catch (err) {
		console.log(err);
	}
};

const handleError = (type, error) => {
	console.log(error);
	console.log(error.stack);
	Logger.error(error, type);

	// SES.sendEmail({
	// 	to: process.env.ERROR_MESSAGE_TO,
	// 	from: process.env.PRODUCTION_MONITORING,
	// 	subject: 'workers/export-jarvis worker crashed.',
	// 	text: error.stack
	// })
	// .then(() => {
	// 	return Q.all([
	// 		client.close(),
	// 		clientMongoDB.close()
	// 	])
	// })
	// .catch(err => Logger.error(err))
	// .finally(() => setTimeout(() => { process.exit(1000) }, 1000))
};

process.on('uncaughtException', (error) => handleError('Uncaught Exception', error));
process.on('unhandledRejection', (error) => handleError('Unhandled Rejection', error));

connectDB();
