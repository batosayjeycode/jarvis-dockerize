"use strict";

require("dotenv").config();

const Q = require("q");
const Swig = require("swig");
const RabbitMq = require("sociolla-core").RabbitMq;
const SES = require("sociolla-core").AWS.SES;
const Logger = require("sociolla-core").Logger.getInstance({
  worker: "send-mail",
});
const fs = require("fs");
const i18n = require("i18n");

i18n.configure({
  locales: ["en", "id", "vi"],
  directory: __dirname + "/locales",
});

// const ObjectId = require('mongodb').ObjectID;

const AbstractFactory = require("../abstract-worker-new");
const FETCH_COUNT = 5;
const MongoClient = require("mongodb").MongoClient;
const client = new MongoClient(process.env.MS_SOCIOLLA_PUBLIC_API_MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

class SendEmail extends AbstractFactory {
  constructor(context) {
    super("send-email", context);
  }
  execute() {
    try {
      Q.try(() => client.connect()).then(() => {
        const self = this;
        RabbitMq.listenQueue(
          "send_email",
          function (message) {
            console.log("received" + JSON.stringify(message));

            const deferred = Q.defer();
            return Q.try(async () => {
              const logger = Logger.getChild(message, {
                startTime: process.hrtime(),
                loggerContext: message.loggerContext,
                req_id: message?.req_id,
              });
              logger.info({ functionContext: arguments }, "Message received");
              const email_logs = {
                subject:
                  (message.template && message.template.subject) ||
                  message.subject,
                recipient_email: [message.to],
                created_at: new Date(),
                status: "pending",
                updated_at: new Date(),
              };
              // const log = await client
              // 	.db(process.env.MS_SOCIOLLA_MONGODB)
              // 	.collection('email_logs')
              // 	.insertOne(email_logs);

              if (
                (!message.recipient || message.recipient.length === 0) &&
                message.details &&
                message.details.email
              ) {
                message.recipient = message.details.email;
              }

              if (
                message.attachments &&
                message.attachments.constructor === [].constructor
              ) {
                message.attachments = message.attachments.map((attachment) => {
                  if (
                    attachment &&
                    attachment.content &&
                    attachment.content.type === "Buffer"
                  ) {
                    const buffer = Buffer.from(attachment.content.data);
                    return {
                      content: buffer,
                      filename: attachment.filename,
                    };
                  }
                });
              }
              if (message.body !== undefined) {
                message.body.content = message.body.content || "";
                message.body.type = message.body.type || "html";
              }
              message.data = message.data || {};
              message.data.currentYear = new Date().getFullYear();

              // Give first preference to template and fallback on body.content.
              if (message.body && message.body.template) {
                if (
                  message.email_from !== undefined &&
                  (["sociolla", "sociolla_vn", "offline_store_vn"].includes(
                    message.email_from
                  ) ||
                    ["sociolla", "sociolla_vn", "offline_store_vn"].includes(
                      message.data.order_source
                    ))
                ) {
                  // header
                  if (
                    ![
                      "welcome-email.html",
                      "wishlist.html",
                      "abandoned.html",
                      "order_notes_updated.html",
                      "free-shipping-3-days.html",
                      "free-shipping-7-days.html",
                      "free-shipping.html",
                      "exchange-order.html",
                      "shift-sales-report.html",
                      "egift-received.html",
                      "egift-send-voucher.html",
                      "award-vote.html",
                      "award-done-voting.html",
                      "award-vote-2023.html",
                      "award-done-voting-2023.html",
                      "vm-cola-voucher.html",
                      "pos_order_cancel_request.html",
                    ].includes(message.body.template)
                  ) {
                    message.body.content = fs.readFileSync(
                      __dirname + "/templates/header_sociolla.html",
                      "utf8"
                    );
                  }
                  // body
                  message.body.content =
                    message.body.content +
                    fs.readFileSync(
                      __dirname + "/templates/" + message.body.template,
                      "utf8"
                    );
                  // footer
                  if (
                    ![
                      "welcome-email.html",
                      "wishlist.html",
                      "abandoned.html",
                      "order_notes_updated.html",
                      "exchange-order.html",
                      "shift-sales-report.html",
                      "egift-received.html",
                      "egift-send-voucher.html",
                      "award-vote.html",
                      "award-done-voting.html",
                      "award-vote-2023.html",
                      "award-done-voting-2023.html",
                      "vm-cola-voucher.html",
                      "pos_order_cancel_request.html",
                      "daily-sales-report.html",
                    ].includes(message.body.template)
                  ) {
                    message.body.content =
                      message.body.content +
                      fs.readFileSync(
                        __dirname + "/templates/footer_sociolla.html",
                        "utf8"
                      );
                  }
                } else if (
                  message.email_from !== undefined &&
                  ([
                    "carasun",
                    "carasun-web-desktop",
                    "carasun-web-mobile",
                  ].includes(message.email_from) ||
                    ["carasun"].includes(message.data.order_source))
                ) {
                  // header
                  message.body.content = fs.readFileSync(
                    __dirname + "/templates/carasun/header-carasun.html",
                    "utf8"
                  );
                  // body
                  message.body.content =
                    message.body.content +
                    fs.readFileSync(
                      __dirname + "/templates/carasun/" + message.body.template,
                      "utf8"
                    );
                  // footer
                  message.body.content =
                    message.body.content +
                    fs.readFileSync(
                      __dirname + "/templates/carasun/footer-carasun.html",
                      "utf8"
                    );
                } else if (
                  message.email_from !== undefined &&
                  (["cosrx", "cosrx-web-desktop", "cosrx-web-mobile"].includes(
                    message.email_from
                  ) ||
                    ["cosrx"].includes(message.data.order_source))
                ) {
                  // header
                  // message.body.content = fs.readFileSync(__dirname + '/templates/cosrx/header-cosrx.html', 'utf8')
                  // body
                  message.body.content =
                    message.body.content +
                    fs.readFileSync(
                      __dirname + "/templates/cosrx/" + message.body.template,
                      "utf8"
                    );
                  // footer
                  // message.body.content = message.body.content + fs.readFileSync(__dirname + '/templates/cosrx/footer-cosrx.html', 'utf8')
                } else if (
                  message.email_from !== undefined &&
                  ["lulla", "lilla"].includes(message.email_from)
                ) {
                  message.body.content = fs.readFileSync(
                    __dirname + "/templates/lulla/" + message.body.template,
                    "utf8"
                  );
                } else if (
                  message.email_from !== undefined &&
                  ["hrms", "shield"].includes(message.email_from)
                ) {
                  message.body.content = fs.readFileSync(
                    __dirname + "/templates/hrms/" + message.body.template,
                    "utf8"
                  );
                  message.from = message.from || "shield@sociolla.info";
                } else if (
                  message.email_from !== undefined &&
                  [
                    "lilla-apps",
                    "lulla-apps",
                    "lulla-web-mobile",
                    "lulla-web-desktop",
                    "lilla-pos",
                    "offline_store_lilla",
                  ].includes(message.email_from)
                ) {
                  message.body.content = fs.readFileSync(
                    __dirname +
                      "/templates/lilla-apps/" +
                      message.body.template,
                    "utf8"
                  );
                } else if (
                  message.email_from !== undefined &&
                  message.email_from === "egift_card"
                ) {
                  message.body.content = fs.readFileSync(
                    __dirname + "/templates/" + message.body.template,
                    "utf8"
                  );
                } else if (
                  message.email_from !== undefined &&
                  message.email_from === "odoo"
                ) {
                  message.body.content = fs.readFileSync(
                    __dirname + "/templates/odoo/" + message.body.template,
                    "utf8"
                  );
                } else if (
                  message.email_from !== undefined &&
                  message.email_from === "sanctum"
                ) {
                  message.body.content = fs.readFileSync(
                    __dirname + "/templates/sanctum/" + message.body.template,
                    "utf8"
                  );
                } else if (
                  message.email_from !== undefined &&
                  message.email_from === "soco-beauty-star"
                ) {
                  message.body.content = fs.readFileSync(
                    __dirname +
                      "/templates/soco-beauty-star/" +
                      message.body.template,
                    "utf8"
                  );
                } else {
                  //Header
                  if (
                    ![
                      "back_in_stock.html",
                      "bj-greetings-email.html",
                      "loyalty-point-earned.html",
                      "review-reminder.html",
                      "luckydrop_reward.html",
                      "loyalty-redeem-shopping.html",
                      "loyalty-redeem-voucher.html",
                      "loyalty-redeem-emoney.html",
                      "luckydrop_reward_aqua.html",
                      "birthday-voucher.html",
                      "vn_checkin_voucher.html",
                      "vn_checkin_reminder_voucher.html",
                      "get-member-invitation.html",
                      "WOF-Offline.html",
                      "cosrx_enroll_2022.html",
                      "cosrx_NL-After-Clicking.html",
                      "cosrx_completed_course.html",
                      "insight_factory_download_report.html",
                      "soco_sbn_welcome_message.html",
                    ].includes(message.body.template)
                  ) {
                    message.body.content = fs.readFileSync(
                      __dirname + "/templates/header.html",
                      "utf8"
                    );
                  }
                  // Body
                  message.body.content =
                    message.body.content +
                    fs.readFileSync(
                      __dirname + "/templates/" + message.body.template,
                      "utf8"
                    );
                  //Footer
                  if (
                    ![
                      "back_in_stock.html",
                      "bj-greetings-email.html",
                      "quick-registration.html",
                      "loyalty-point-earned.html",
                      "review-reminder.html",
                      "luckydrop_reward.html",
                      "luckydrop_reward_aqua.html",
                      "birthday-voucher.html",
                      "vn_checkin_voucher.html",
                      "vn_checkin_reminder_voucher.html",
                      "get-member-invitation.html",
                      "WOF-Offline.html",
                      "cosrx_enroll_2022.html",
                      "cosrx_NL-After-Clicking.html",
                      "cosrx_completed_course.html",
                      "insight_factory_download_report.html",
                      "soco_sbn_welcome_message.html",
                    ].includes(message.body.template)
                  ) {
                    message.body.content =
                      message.body.content +
                      fs.readFileSync(
                        __dirname + "/templates/footer.html",
                        "utf8"
                      );
                  }
                }
              } else {
                if (["hrms", "shield"].includes(message.email_from)) {
                  message.from = message.from || "shield@sociolla.info";
                }
              }
              /* All sociolla vn orders will be tranlated to vietnamese */
              if (
                message.data &&
                message.data.order_source &&
                (message.data.order_source == "sociolla_vn" ||
                  message.data.order_source == "offline_store_vn" ||
                  message.data.order_source == "sociolla_vn_android" ||
                  message.data.order_source == "sociolla_vn_ios")
              ) {
                message.locale = "vi";
              }
              // SOC-52052 Message from sociolla_vn will be set to locale vi
              if (message && message.email_from == "sociolla_vn") {
                message.locale = "vi";
              }
              message.data.locale = message.locale || "id";
              i18n.setLocale(message.data.locale);
              message.data.i18n = i18n;
              // Using swig to render content in placeholder in the body.content.
              message.body.content = Swig.render(message.body.content, {
                locals: message.data,
              });
              if (message.subjectName) {
                message.subject = Swig.render(
                  i18n.__(message.subject, message.subjectName),
                  {
                    locals: message.data,
                    autoescape: false,
                  }
                );
              } else {
                message.subject = Swig.render(i18n.__(message.subject), {
                  locals: message.data,
                  autoescape: false,
                });
              }
              //message.subject = Swig.render(i18n.__(message.subject), {'locals': message.data, 'autoescape': false});
              if (
                typeof message.attachments == "object" &&
                message.attachments.constructor == {}.constructor
              ) {
                message.attachments = [];
              }
              return SES.sendEmail(
                {
                  from: message.from,
                  to: Array.isArray(message.to) ? message.to : [message.to],
                  cc: message.details && message.details.cc,
                  bcc: message.details && message.details.bcc,
                  replyTo: message.details && message.details.replyTo,
                  subject:
                    (message.template && message.template.subject) ||
                    message.subject,
                  html:
                    message.body.type === "html"
                      ? message.body.content
                      : undefined,
                  text:
                    message.body.type === "text"
                      ? message.body.content
                      : undefined,
                  attachments: message.attachments || [],
                  sparkPostOption: message.sparkPostOption || null,
                },
                "send_in_blue",
                ["hrms", "shield", "odoo"].includes(message.email_from)
                  ? true
                  : false
              )
                .then((result) => {
                  email_logs.status = "success";
                  deferred.resolve();
                })
                .catch((err) => {
                  self.logError(err);
                  email_logs.status = "failure";
                  email_logs.reason = String(err.message);
                  deferred.reject(err);
                })
                .finally(() => {
                  logger.info(
                    { responseTime: process.hrtime(logger.fields.startTime) },
                    "Message processed"
                  );
                  delete email_logs.created_at;
                  return true;
                  // return Q.try(() =>
                  // 	client
                  // 		.db(process.env.MS_SOCIOLLA_MONGODB)
                  // 		.collection('email_logs')
                  // 		.findOneAndUpdate({ _id: ObjectId(log.ops[0]._id) }, { $set: email_logs }),
                  // );
                });
            });
          },
          FETCH_COUNT
        );
      });
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}

const worker = new SendEmail("send-email");
return Q.try(() => worker.start())
  .catch((err) => {
    console.error(err);
    Logger.error(err);
    throw err;
  })
  .finally(() => {
    Logger.info(
      { responseTime: process.hrtime(Logger.fields.startTime) },
      "Message processed"
    );
  });
