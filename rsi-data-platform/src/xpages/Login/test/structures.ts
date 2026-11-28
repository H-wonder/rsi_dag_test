// 由 loop-structures/structures/*.json 生成，供画布演示使用。
// 重新生成：python3 loop-structures/harness/export_platform_structures.py
export const structures: Record<string, any> = {
  "finance.invoice_email_extract": {
  "meta": {
    "task": "finance.invoice_email_extract",
    "benchmark": "finance.invoice_email_extract",
    "domain": "finance",
    "pattern": "P4",
    "kind": "backup",
    "bridge": "http://127.0.0.1:8765",
    "description": "备用题补齐（能力缺口）：新增 extract 语义抽取节点（prompt + JSON schema + validate + retry），逐封邮件调用模型抽取发票/政策字段；再用已有 join/filter/loop 节点做阻断名单过滤、Slack 金额更正、阈值判断、写表与邮件汇总。"
  },
  "nodes": [
    {
      "id": "fetch_messages",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        "params": {
          "maxResults": 100
        }
      },
      "out": "messages_raw"
    },
    {
      "id": "map_messages",
      "type": "map",
      "items": "{{messages_raw.messages}}",
      "out": "messages"
    },
    {
      "id": "fetch_all",
      "type": "loop",
      "mode": "forEach",
      "items": "{{messages}}",
      "itemVar": "m",
      "body": [
        "fetch_detail",
        "extract_email",
        "collect_email"
      ],
      "maxIterations": 20,
      "onError": "abort",
      "checkpoint": {
        "every": 1,
        "keep": 20
      }
    },
    {
      "id": "fetch_detail",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/{{m.id}}"
      },
      "out": "detail"
    },
    {
      "id": "extract_email",
      "type": "extract",
      "out": "email_data",
      "retries": 1,
      "reasoningEffort": "low",
      "maxTokens": 700,
      "system": "You are a precise information extraction engine for an accounts-payable inbox. Return only one JSON object, no markdown, no commentary.",
      "prompt": "Classify this email and extract the requested fields.\nKinds: invoice (a vendor invoice with an invoice number), policy (an internal AP guideline or a requested policy change), other (anything else).\nRules:\n- dates must be YYYY-MM-DD.\n- amount must be a JSON number without currency symbols.\n- vendor is the legal vendor name from the signature, verbatim.\n- sender is the From email address, verbatim.\n- For policy messages, authority is controller|vp|external|other; review_threshold is the numeric threshold if the message sets one, else null.\n- Use null for missing values; never invent.\n\nFrom: {{detail.from}}\nSubject: {{detail.subject}}\nBody:\n{{detail.body_plain}}",
      "schema": {
        "kind": "invoice|policy|other",
        "vendor": "string|null",
        "invoice": "string|null",
        "invoice_date": "YYYY-MM-DD|null",
        "due_date": "YYYY-MM-DD|null",
        "amount": "number|null",
        "sender": "string",
        "authority": "controller|vp|external|other|null",
        "review_threshold": "number|null"
      },
      "validate": "(sender != null and sender.contains('@')) and (kind != 'invoice' or (vendor != null and invoice != null and amount != null and invoice_date != null and due_date != null)) and (kind != 'policy' or authority != null)"
    },
    {
      "id": "collect_email",
      "type": "collect",
      "stateKey": "emails",
      "as": "array",
      "value": "{{email_data}}"
    },
    {
      "id": "fetch_blocked",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_inv_tracker/values/Blocked Vendors!A1:Z100"
      },
      "out": "blocked_raw"
    },
    {
      "id": "rows_blocked",
      "type": "rows",
      "items": "{{blocked_raw.values}}",
      "out": "blocked_rows"
    },
    {
      "id": "map_blocked",
      "type": "map",
      "items": "{{blocked_rows}}",
      "fields": {
        "key": "{{item.Vendor_Name.toLowerCase()}}",
        "name": "{{item.Vendor_Name}}",
        "status": "{{item.Status}}",
        "reason": "{{item.Reason}}"
      },
      "out": "blocked_keys"
    },
    {
      "id": "fetch_slack",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://slack.com/api/conversations.history",
        "params": {
          "channel": "C_AP",
          "limit": 50
        }
      },
      "out": "slack_raw"
    },
    {
      "id": "map_slack",
      "type": "map",
      "items": "{{slack_raw.messages}}",
      "out": "slack_messages"
    },
    {
      "id": "first_slack",
      "type": "first",
      "items": "{{slack_messages}}",
      "out": "slack_msg",
      "itemVar": "slack_msg"
    },
    {
      "id": "extract_correction",
      "type": "extract",
      "out": "correction",
      "retries": 1,
      "reasoningEffort": "low",
      "maxTokens": 300,
      "system": "You extract one invoice correction from a short message. Return only one JSON object.",
      "prompt": "Extract the invoice number being corrected and the corrected amount.\nMessage:\n{{slack_msg.text}}",
      "schema": {
        "invoice": "string",
        "corrected_amount": "number"
      },
      "required": [
        "invoice",
        "corrected_amount"
      ]
    },
    {
      "id": "invoices",
      "type": "filter",
      "items": "{{loop_fetch_all.state.emails}}",
      "when": "item.kind == 'invoice'",
      "out": "invoices"
    },
    {
      "id": "add_key",
      "type": "map",
      "items": "{{invoices}}",
      "fields": {
        "vendor": "{{item.vendor}}",
        "invoice": "{{item.invoice}}",
        "amount": "{{item.amount}}",
        "invoice_date": "{{item.invoice_date}}",
        "due_date": "{{item.due_date}}",
        "sender": "{{item.sender}}",
        "vendor_key": "{{item.vendor.toLowerCase()}}"
      },
      "out": "invoices_keyed"
    },
    {
      "id": "join_blocked",
      "type": "join",
      "items": "{{invoices_keyed}}",
      "with": "blocked_keys",
      "leftKey": "vendor_key",
      "rightKey": "key",
      "fields": {
        "blocked_reason": "reason"
      },
      "setFound": "blocked",
      "out": "with_blocked"
    },
    {
      "id": "legit_invoices",
      "type": "filter",
      "items": "{{with_blocked}}",
      "when": "not item.blocked",
      "out": "legit_invoices"
    },
    {
      "id": "blocked_invoices",
      "type": "filter",
      "items": "{{with_blocked}}",
      "when": "item.blocked",
      "out": "blocked_invoices"
    },
    {
      "id": "vp_policies",
      "type": "filter",
      "items": "{{loop_fetch_all.state.emails}}",
      "when": "item.kind == 'policy' and item.authority != null and item.authority.toLowerCase() == 'vp' and item.sender != null and item.sender.toLowerCase().endsWith('@company.example.com')",
      "out": "vp_policies"
    },
    {
      "id": "first_policy",
      "type": "first",
      "items": "{{vp_policies}}",
      "out": "effective_policy",
      "itemVar": "effective_policy"
    },
    {
      "id": "assert_policy",
      "type": "assert",
      "expr": "effective_policy != null and effective_policy.review_threshold != null",
      "message": "没有抽取到 VP 的内部阈值覆盖"
    },
    {
      "id": "count_legit",
      "type": "aggregate",
      "items": "{{legit_invoices}}",
      "op": "count",
      "out": "legit_count"
    },
    {
      "id": "count_blocked",
      "type": "aggregate",
      "items": "{{blocked_invoices}}",
      "op": "count",
      "out": "blocked_count"
    },
    {
      "id": "assert_counts",
      "type": "assert",
      "expr": "legit_count == 2 and blocked_count == 2",
      "message": "抽取后的合法/阻断发票数量不符合预期"
    },
    {
      "id": "apply_correction",
      "type": "map",
      "items": "{{legit_invoices}}",
      "fields": {
        "vendor": "{{item.vendor}}",
        "invoice": "{{item.invoice}}",
        "sender": "{{item.sender}}",
        "invoice_date": "{{item.invoice_date}}",
        "due_date": "{{item.due_date}}",
        "amount": "{{item.invoice == correction.invoice ? correction.corrected_amount : item.amount}}"
      },
      "out": "corrected_invoices"
    },
    {
      "id": "prepare_rows",
      "type": "map",
      "items": "{{corrected_invoices}}",
      "fields": {
        "vendor": "{{item.vendor}}",
        "invoice": "{{item.invoice}}",
        "amount": "{{item.amount}}",
        "notes": "{{item.amount * 1 >= effective_policy.review_threshold * 1 ? 'REVIEW - over threshold' : ''}}"
      },
      "out": "sheet_rows"
    },
    {
      "id": "loop_append",
      "type": "loop",
      "mode": "forEach",
      "items": "{{sheet_rows}}",
      "itemVar": "r",
      "body": [
        "format_amount",
        "append_row"
      ],
      "maxIterations": 20,
      "onError": "abort"
    },
    {
      "id": "format_amount",
      "type": "compute",
      "left": "{{r.amount}}",
      "right": 0,
      "op": "add",
      "format": "money",
      "out": "amount_text"
    },
    {
      "id": "append_row",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_inv_tracker/values/Pending Invoices!A1:D1:append",
        "params": {
          "valueInputOption": "RAW"
        },
        "body": {
          "values": [
            [
              "{{r.vendor}}",
              "{{r.invoice}}",
              "{{amount_text}}",
              "{{r.notes}}"
            ]
          ]
        }
      }
    },
    {
      "id": "loop_reject",
      "type": "loop",
      "mode": "forEach",
      "items": "{{blocked_invoices}}",
      "itemVar": "b",
      "body": [
        "encode_rejection",
        "send_rejection"
      ],
      "maxIterations": 20,
      "onError": "abort"
    },
    {
      "id": "encode_rejection",
      "type": "encode",
      "value": "Your invoice {{b.invoice}} was not processed. The vendor relationship is currently suspended ({{b.blocked_reason}}). Please contact our AP team.",
      "out": "rejection_b64"
    },
    {
      "id": "send_rejection",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{b.sender}}"
              },
              {
                "name": "Subject",
                "value": "Invoice {{b.invoice}} not processed"
              }
            ],
            "body": {
              "data": "{{rejection_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "sum_total",
      "type": "aggregate",
      "items": "{{sheet_rows}}",
      "op": "sum",
      "field": "item.amount",
      "out": "total_raw"
    },
    {
      "id": "format_total",
      "type": "compute",
      "left": "{{total_raw}}",
      "right": 0,
      "op": "add",
      "format": "money",
      "out": "total_text"
    },
    {
      "id": "encode_summary",
      "type": "encode",
      "value": "Logged total: ${{total_text}}\nLogged invoices: {{legit_count}}\nBlocked invoices returned: {{blocked_count}}\nBatch includes the Slack-corrected Global Logistics amount.",
      "out": "summary_b64"
    },
    {
      "id": "send_summary",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "ap-lead@company.example.com"
              },
              {
                "name": "Subject",
                "value": "AP invoice logging summary"
              }
            ],
            "body": {
              "data": "{{summary_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "fetch_pending",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_inv_tracker/values/Pending Invoices!A1:Z100"
      },
      "out": "pending_after"
    },
    {
      "id": "assert_pending",
      "type": "assert",
      "expr": "pending_after.values.size() == 3",
      "message": "Pending Invoices 应为表头 + 2 条合法发票"
    }
  ],
  "edges": [
    [
      "start",
      "fetch_messages"
    ],
    [
      "fetch_messages",
      "map_messages"
    ],
    [
      "map_messages",
      "fetch_all"
    ],
    [
      "fetch_all",
      "fetch_blocked"
    ],
    [
      "fetch_blocked",
      "rows_blocked"
    ],
    [
      "rows_blocked",
      "map_blocked"
    ],
    [
      "map_blocked",
      "fetch_slack"
    ],
    [
      "fetch_slack",
      "map_slack"
    ],
    [
      "map_slack",
      "first_slack"
    ],
    [
      "first_slack",
      "extract_correction"
    ],
    [
      "extract_correction",
      "invoices"
    ],
    [
      "invoices",
      "add_key"
    ],
    [
      "add_key",
      "join_blocked"
    ],
    [
      "join_blocked",
      "legit_invoices"
    ],
    [
      "legit_invoices",
      "blocked_invoices"
    ],
    [
      "blocked_invoices",
      "vp_policies"
    ],
    [
      "vp_policies",
      "first_policy"
    ],
    [
      "first_policy",
      "assert_policy"
    ],
    [
      "assert_policy",
      "count_legit"
    ],
    [
      "count_legit",
      "count_blocked"
    ],
    [
      "count_blocked",
      "assert_counts"
    ],
    [
      "assert_counts",
      "apply_correction"
    ],
    [
      "apply_correction",
      "prepare_rows"
    ],
    [
      "prepare_rows",
      "loop_append"
    ],
    [
      "loop_append",
      "loop_reject"
    ],
    [
      "loop_reject",
      "sum_total"
    ],
    [
      "sum_total",
      "format_total"
    ],
    [
      "format_total",
      "encode_summary"
    ],
    [
      "encode_summary",
      "send_summary"
    ],
    [
      "send_summary",
      "fetch_pending"
    ],
    [
      "fetch_pending",
      "assert_pending"
    ]
  ]
},
  "finance.payment_terms_tracking": {
  "meta": {
    "task": "finance.payment_terms_tracking",
    "domain": "finance",
    "pattern": "P5",
    "bridge": "http://127.0.0.1:8765",
    "description": "5 个供应商逐条处理；优先采用邮件/Slack 中的最新条款（Pinnacle Net 20、CloudHost Net 30、Metro 争议已解决），其余按 Finalized 行发确认邮件"
  },
  "nodes": [
    {
      "id": "fetch",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_term_changes/values/Q1 2026 Changes!A1:Z100"
      },
      "out": "sheet"
    },
    {
      "id": "rows",
      "type": "rows",
      "items": "{{sheet.values}}",
      "out": "changes"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "changes",
      "itemVar": "v",
      "body": [
        "route"
      ],
      "maxIterations": 20,
      "onError": "continue",
      "checkpoint": {
        "every": 1,
        "keep": 20
      }
    },
    {
      "id": "route",
      "type": "branch",
      "cases": [
        {
          "when": "v.Vendor == 'Pinnacle Logistics'",
          "body": [
            "enc_pin",
            "send_pin"
          ]
        },
        {
          "when": "v.Vendor == 'CloudHost Pro'",
          "body": [
            "enc_cloud",
            "send_cloud"
          ]
        },
        {
          "when": "v.Vendor == 'Metro Supply'",
          "body": [
            "enc_metro",
            "send_metro"
          ]
        },
        {
          "when": "v.Status == 'Finalized'",
          "body": [
            "enc_std",
            "send_std"
          ]
        }
      ],
      "default": []
    },
    {
      "id": "enc_pin",
      "type": "encode",
      "value": "Your payment terms are now Net 20.",
      "out": "pin_b64"
    },
    {
      "id": "send_pin",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{v.Contact}}"
              },
              {
                "name": "Subject",
                "value": "Updated payment terms - {{v.Vendor}}"
              }
            ],
            "body": {
              "data": "{{pin_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "enc_cloud",
      "type": "encode",
      "value": "Your payment terms are now Net 30.",
      "out": "cloud_b64"
    },
    {
      "id": "send_cloud",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{v.Contact}}"
              },
              {
                "name": "Subject",
                "value": "Updated payment terms - {{v.Vendor}}"
              }
            ],
            "body": {
              "data": "{{cloud_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "enc_metro",
      "type": "encode",
      "value": "Your payment terms are now 2/10 Net 30.",
      "out": "metro_b64"
    },
    {
      "id": "send_metro",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{v.Contact}}"
              },
              {
                "name": "Subject",
                "value": "Updated payment terms - {{v.Vendor}}"
              }
            ],
            "body": {
              "data": "{{metro_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "enc_std",
      "type": "encode",
      "value": "Your payment terms are now {{v.New_Terms}}.",
      "out": "std_b64"
    },
    {
      "id": "send_std",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{v.Contact}}"
              },
              {
                "name": "Subject",
                "value": "Updated payment terms - {{v.Vendor}}"
              }
            ],
            "body": {
              "data": "{{std_b64}}"
            }
          }
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch"
    ],
    [
      "fetch",
      "rows"
    ],
    [
      "rows",
      "loop1"
    ]
  ]
},
  "finance.qb_invoice_from_orders": {
  "meta": {
    "task": "finance.qb_invoice_from_orders",
    "domain": "finance",
    "pattern": "P1",
    "bridge": "http://127.0.0.1:8765",
    "description": "读取订单表，只取 Delivered，逐单建 QuickBooks 发票并按客户发邮件"
  },
  "nodes": [
    {
      "id": "fetch",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_orders/values/February 2026!A1:Z100"
      },
      "out": "sheet"
    },
    {
      "id": "rows",
      "type": "rows",
      "items": "{{sheet.values}}",
      "out": "orders"
    },
    {
      "id": "pick",
      "type": "filter",
      "items": "orders",
      "when": "item.Status == 'Delivered'",
      "out": "due"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "due",
      "itemVar": "o",
      "body": [
        "invoice",
        "encode",
        "send"
      ],
      "maxIterations": 20,
      "onError": "continue"
    },
    {
      "id": "invoice",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://quickbooks.api.intuit.com/v3/company/1/invoice",
        "body": {
          "CustomerRef": {
            "value": "{{o.Customer}}"
          },
          "Line": [
            {
              "DetailType": "SalesItemLineDetail",
              "Amount": "{{o['Unit Price']}}"
            }
          ],
          "PrivateNote": "{{o['Order #']}}"
        }
      }
    },
    {
      "id": "encode",
      "type": "encode",
      "value": "Order {{o['Order #']}} total {{o['Unit Price']}}",
      "out": "body_b64"
    },
    {
      "id": "send",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{o['Customer Email']}}"
              },
              {
                "name": "Subject",
                "value": "Invoice {{o['Order #']}}"
              }
            ],
            "body": {
              "data": "{{body_b64}}"
            }
          }
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch"
    ],
    [
      "fetch",
      "rows"
    ],
    [
      "rows",
      "pick"
    ],
    [
      "pick",
      "loop1"
    ]
  ]
},
  "finance.revenue_recognition": {
  "meta": {
    "task": "finance.revenue_recognition",
    "domain": "finance",
    "pattern": "P3",
    "bridge": "http://127.0.0.1:8765",
    "description": "按合同逐条计算月度确认额；排除 Cancelled 与次月及以后开始的合同；写入 1 月排期并发汇总邮件"
  },
  "nodes": [
    {
      "id": "fetch",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_revrec/values/Active Contracts!A1:Z100"
      },
      "out": "sheet"
    },
    {
      "id": "rows",
      "type": "rows",
      "items": "{{sheet.values}}",
      "out": "contracts"
    },
    {
      "id": "pick",
      "type": "filter",
      "items": "contracts",
      "when": "item.Status == 'Active' and item.Start_Date.substring(0,7).compareTo('2026-01') <= 0",
      "out": "due"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "due",
      "itemVar": "c",
      "body": [
        "calc",
        "append"
      ],
      "maxIterations": 20,
      "onError": "continue",
      "state": {
        "total": 0
      }
    },
    {
      "id": "calc",
      "type": "compute",
      "left": "{{c.Total_Value}}",
      "right": "{{c.Term_Months_}}",
      "op": "divide",
      "out": "monthly",
      "format": "money",
      "accumulate": "total",
      "totalOut": "grand_total"
    },
    {
      "id": "append",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_revrec/values/January 2026 Schedule!A1:C1:append",
        "params": {
          "valueInputOption": "RAW"
        },
        "body": {
          "values": [
            [
              "{{c.Contract_ID}}",
              "{{c.Customer}}",
              "{{monthly}}"
            ]
          ]
        }
      }
    },
    {
      "id": "encode",
      "type": "encode",
      "value": "January 2026 recognized total: {{grand_total}}",
      "out": "mail_b64"
    },
    {
      "id": "send",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "controller@company.example.com"
              },
              {
                "name": "Subject",
                "value": "Revenue Recognition - January 2026"
              }
            ],
            "body": {
              "data": "{{mail_b64}}"
            }
          }
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch"
    ],
    [
      "fetch",
      "rows"
    ],
    [
      "rows",
      "pick"
    ],
    [
      "pick",
      "loop1"
    ],
    [
      "loop1",
      "encode"
    ],
    [
      "encode",
      "send"
    ]
  ]
},
  "finance.vendor_insurance_verification": {
  "meta": {
    "task": "finance.vendor_insurance_verification",
    "domain": "finance",
    "pattern": "P5",
    "bridge": "http://127.0.0.1:8765",
    "today": "2026-02-15",
    "description": "只处理 Active 供应商；按到期日分支：已过期→改 Non-Compliant + 通知；30 天内→提醒；最后汇总邮件 + Slack"
  },
  "nodes": [
    {
      "id": "fetch",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_vendor_insurance/values/Certificates!A1:Z100"
      },
      "out": "sheet"
    },
    {
      "id": "rows",
      "type": "rows",
      "items": "{{sheet.values}}",
      "out": "vendors"
    },
    {
      "id": "pick",
      "type": "filter",
      "items": "vendors",
      "when": "item.Status == 'Active'",
      "out": "active"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "active",
      "itemVar": "v",
      "body": [
        "days",
        "route"
      ],
      "maxIterations": 50,
      "onError": "continue",
      "state": {
        "summary": ""
      },
      "checkpoint": {
        "every": 1,
        "keep": 20
      }
    },
    {
      "id": "days",
      "type": "datediff",
      "from": "{{meta.today}}",
      "to": "{{v.Certificate_Expiry}}",
      "out": "days"
    },
    {
      "id": "route",
      "type": "branch",
      "cases": [
        {
          "when": "days < 0",
          "body": [
            "status",
            "collect",
            "enc_exp",
            "send_exp"
          ]
        },
        {
          "when": "days <= 30",
          "body": [
            "collect",
            "enc_warn",
            "send_warn"
          ]
        }
      ],
      "default": []
    },
    {
      "id": "status",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "PUT",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_vendor_insurance/values/Certificates!E{{v._row}}",
        "params": {
          "valueInputOption": "RAW"
        },
        "body": {
          "values": [
            [
              "Non-Compliant"
            ]
          ]
        }
      }
    },
    {
      "id": "collect",
      "type": "collect",
      "value": "{{v.Vendor}} — expiry {{v.Certificate_Expiry}}",
      "stateKey": "summary"
    },
    {
      "id": "enc_exp",
      "type": "encode",
      "value": "Your insurance certificate for {{v.Vendor}} expired on {{v.Certificate_Expiry}}. Please renew immediately.",
      "out": "exp_b64"
    },
    {
      "id": "send_exp",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{v.Email}}"
              },
              {
                "name": "Subject",
                "value": "Insurance certificate expired - {{v.Vendor}}"
              }
            ],
            "body": {
              "data": "{{exp_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "enc_warn",
      "type": "encode",
      "value": "Your insurance certificate for {{v.Vendor}} expires on {{v.Certificate_Expiry}} (within 30 days). Please renew.",
      "out": "warn_b64"
    },
    {
      "id": "send_warn",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{v.Email}}"
              },
              {
                "name": "Subject",
                "value": "Insurance certificate expiring - {{v.Vendor}}"
              }
            ],
            "body": {
              "data": "{{warn_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "enc_sum",
      "type": "encode",
      "value": "Vendor insurance compliance:\n{{loop_loop1.state.summary}}",
      "out": "sum_b64"
    },
    {
      "id": "send_sum",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "compliance@company.example.com"
              },
              {
                "name": "Subject",
                "value": "Vendor insurance compliance report"
              }
            ],
            "body": {
              "data": "{{sum_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "slack",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://slack.com/api/chat.postMessage",
        "body": {
          "channel": "C_VENDOR",
          "text": "Vendor compliance: Metro Supply expired; Acme Supplies expires within 30 days."
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch"
    ],
    [
      "fetch",
      "rows"
    ],
    [
      "rows",
      "pick"
    ],
    [
      "pick",
      "loop1"
    ],
    [
      "loop1",
      "enc_sum"
    ],
    [
      "enc_sum",
      "send_sum"
    ],
    [
      "send_sum",
      "slack"
    ]
  ]
},
  "hr.monday_onboarding_pipeline": {
  "meta": {
    "task": "hr.monday_onboarding_pipeline",
    "domain": "hr",
    "pattern": "P1",
    "bridge": "http://127.0.0.1:8765",
    "description": "读取新员工表，过滤 Contractor 和备注延期者，逐人创建 Monday item（item_name 含姓名与部门）"
  },
  "nodes": [
    {
      "id": "fetch",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_march_hires/values/Starting Week of March 24!A1:Z100"
      },
      "out": "sheet"
    },
    {
      "id": "rows",
      "type": "rows",
      "items": "{{sheet.values}}",
      "out": "hires"
    },
    {
      "id": "pick",
      "type": "filter",
      "items": "hires",
      "when": "item.Type == 'Full-time' and item.Notes == ''",
      "out": "due"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "due",
      "itemVar": "h",
      "body": [
        "create"
      ],
      "maxIterations": 10,
      "onError": "continue",
      "state": {
        "created": 0
      }
    },
    {
      "id": "create",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://api.monday.com/v2/items:create",
        "body": {
          "board_id": "board_onboarding",
          "item_name": "{{h.Name}} - {{h.Department}}",
          "column_values": {
            "date": "{{h['Start Date']}}",
            "status": "Not Started"
          }
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch"
    ],
    [
      "fetch",
      "rows"
    ],
    [
      "rows",
      "pick"
    ],
    [
      "pick",
      "loop1"
    ]
  ]
},
  "hr.policy_update_distribution": {
  "meta": {
    "task": "hr.policy_update_distribution",
    "domain": "hr",
    "pattern": "P1",
    "bridge": "http://127.0.0.1:8765",
    "description": "只分发已批准的 Remote Work Policy；Remote + Full-time 员工逐个发邮件；Carol 已搬回 Austin，按 Slack 最新信息排除"
  },
  "nodes": [
    {
      "id": "fetch",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_directory/values/All Employees!A1:Z100"
      },
      "out": "sheet"
    },
    {
      "id": "rows",
      "type": "rows",
      "items": "{{sheet.values}}",
      "out": "employees"
    },
    {
      "id": "pick",
      "type": "filter",
      "items": "employees",
      "when": "item.Location == 'Remote' and item.Type == 'Full-time' and item.Employee != 'Carol Diaz'",
      "out": "recipients"
    },
    {
      "id": "encode",
      "type": "encode",
      "value": "Remote Work Policy (effective April 1, 2026): core hours 10 AM - 3 PM local time; monthly in-person team meetup; home office stipend increased to $1,500/year.",
      "out": "mail_b64"
    },
    {
      "id": "slack",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://slack.com/api/chat.postMessage",
        "body": {
          "channel": "C_ANNOUNCE",
          "text": "Remote Work Policy update (effective April 1, 2026): remote employees must be available 10 AM - 3 PM local; monthly in-person meetup; home office stipend increased to $1,500/year."
        }
      }
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "recipients",
      "itemVar": "r",
      "body": [
        "send"
      ],
      "maxIterations": 20,
      "onError": "continue"
    },
    {
      "id": "send",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{r.Email}}"
              },
              {
                "name": "Subject",
                "value": "Remote Work Policy Update (effective April 1, 2026)"
              }
            ],
            "body": {
              "data": "{{mail_b64}}"
            }
          }
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch"
    ],
    [
      "fetch",
      "rows"
    ],
    [
      "rows",
      "pick"
    ],
    [
      "pick",
      "encode"
    ],
    [
      "encode",
      "slack"
    ],
    [
      "slack",
      "loop1"
    ]
  ]
},
  "hr.zoom_orientation_sessions": {
  "meta": {
    "task": "hr.zoom_orientation_sessions",
    "domain": "hr",
    "pattern": "P5",
    "bridge": "http://127.0.0.1:8765",
    "description": "5 人 cohort：排除延期/撤回；为 I-9 已提交者建 Zoom 会议并注册、发确认信；未提交者只上报 HR Director 并通知本人，不直接取消"
  },
  "nodes": [
    {
      "id": "fetch",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_orientation/values/Cohort March 24!A1:Z100"
      },
      "out": "sheet"
    },
    {
      "id": "rows",
      "type": "rows",
      "items": "{{sheet.values}}",
      "out": "cohort"
    },
    {
      "id": "pick",
      "type": "filter",
      "items": "cohort",
      "when": "not item.Notes.toLowerCase().contains('moved') and not item.Notes.toLowerCase().contains('rescinded')",
      "out": "eligible"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "eligible",
      "itemVar": "c",
      "body": [
        "route"
      ],
      "maxIterations": 20,
      "onError": "continue",
      "checkpoint": {
        "every": 1,
        "keep": 20
      }
    },
    {
      "id": "route",
      "type": "branch",
      "cases": [
        {
          "when": "c.I_9_Submitted == 'Yes'",
          "body": [
            "meeting",
            "registrant",
            "enc_yes",
            "send_yes"
          ]
        },
        {
          "when": "c.I_9_Submitted == 'No'",
          "body": [
            "enc_dir",
            "send_dir",
            "enc_pend",
            "send_pend"
          ]
        }
      ],
      "default": []
    },
    {
      "id": "meeting",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://api.zoom.us/v2/users/me/meetings",
        "body": {
          "topic": "Orientation - {{c.Name}}",
          "type": 2,
          "start_time": "{{c.Start_Date}}T10:00:00Z",
          "duration": "{{c.Location == 'Remote' ? 120 : 60}}",
          "timezone": "UTC",
          "settings": {
            "approval_type": 0
          }
        }
      },
      "out": "meeting"
    },
    {
      "id": "registrant",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://api.zoom.us/v2/meetings/{{meeting.id}}/registrants",
        "body": {
          "email": "{{c.Email}}",
          "first_name": "{{c.Name}}",
          "last_name": "Hire"
        }
      }
    },
    {
      "id": "enc_yes",
      "type": "encode",
      "value": "Your orientation is confirmed. Date: {{c.Start_Date}}. Duration: {{c.Location == 'Remote' ? '2 hour' : '1 hour'}}.",
      "out": "yes_b64"
    },
    {
      "id": "send_yes",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{c.Email}}"
              },
              {
                "name": "Subject",
                "value": "Orientation - {{c.Start_Date}}"
              }
            ],
            "body": {
              "data": "{{yes_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "enc_dir",
      "type": "encode",
      "value": "{{c.Name}} ({{c.Email}}) has not submitted the I-9 form; orientation is pending your decision.",
      "out": "dir_b64"
    },
    {
      "id": "send_dir",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "hr-director@company.example.com"
              },
              {
                "name": "Subject",
                "value": "Orientation pending I-9 - {{c.Name}}"
              }
            ],
            "body": {
              "data": "{{dir_b64}}"
            }
          }
        }
      }
    },
    {
      "id": "enc_pend",
      "type": "encode",
      "value": "Your orientation is on hold pending I-9 submission.",
      "out": "pend_b64"
    },
    {
      "id": "send_pend",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "{{c.Email}}"
              },
              {
                "name": "Subject",
                "value": "Orientation pending I-9"
              }
            ],
            "body": {
              "data": "{{pend_b64}}"
            }
          }
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch"
    ],
    [
      "fetch",
      "rows"
    ],
    [
      "rows",
      "pick"
    ],
    [
      "pick",
      "loop1"
    ]
  ]
},
  "operations.mailchimp_ecommerce_sync": {
  "meta": {
    "task": "operations.mailchimp_ecommerce_sync",
    "domain": "operations",
    "pattern": "P5",
    "bridge": "http://127.0.0.1:8765",
    "today": "2026-01-29",
    "description": "7 条订单逐条判断：7 天窗口、排除退款/取消/内部测试/opt-out；合格者加入 Mailchimp 并按首购/复购/高价值打标签；Slack 汇总"
  },
  "nodes": [
    {
      "id": "fetch_orders",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_orders/values/Recent!A1:Z100"
      },
      "out": "orders_sheet"
    },
    {
      "id": "rows_orders",
      "type": "rows",
      "items": "{{orders_sheet.values}}",
      "out": "orders"
    },
    {
      "id": "fetch_optout",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_orders/values/Marketing Opt-Out!A1:Z100"
      },
      "out": "optout_sheet"
    },
    {
      "id": "rows_optout",
      "type": "rows",
      "items": "{{optout_sheet.values}}",
      "out": "optouts"
    },
    {
      "id": "join_optout",
      "type": "join",
      "items": "orders",
      "with": "optouts",
      "leftKey": "Email",
      "rightKey": "Email",
      "setFound": "opted_out",
      "out": "orders_joined"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "orders_joined",
      "itemVar": "o",
      "body": [
        "days",
        "route"
      ],
      "maxIterations": 50,
      "onError": "continue",
      "state": {
        "summary": "",
        "synced": 0
      },
      "checkpoint": {
        "every": 1,
        "keep": 20
      }
    },
    {
      "id": "days",
      "type": "datediff",
      "from": "{{o.Order_Date}}",
      "to": "{{meta.today}}",
      "out": "days"
    },
    {
      "id": "route",
      "type": "branch",
      "cases": [
        {
          "when": "days >= 0 and days <= 7 and not o.Notes.toLowerCase().contains('refund') and not o.Notes.toLowerCase().contains('cancel') and not o.Notes.toLowerCase().contains('chargeback') and not o.Notes.toLowerCase().contains('internal') and not o.opted_out",
          "body": [
            "add_member",
            "tag_route",
            "value_route",
            "collect"
          ]
        }
      ],
      "default": []
    },
    {
      "id": "add_member",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://us1.api.mailchimp.com/3.0/lists/aud_main/members",
        "body": {
          "email_address": "{{o.Email}}",
          "status": "subscribed"
        }
      }
    },
    {
      "id": "tag_route",
      "type": "branch",
      "cases": [
        {
          "when": "o.Order_Count * 1 == 1",
          "body": [
            "tag_new"
          ]
        },
        {
          "when": "o.Order_Count * 1 >= 2",
          "body": [
            "tag_repeat",
            "tag_vip"
          ]
        }
      ],
      "default": []
    },
    {
      "id": "value_route",
      "type": "branch",
      "cases": [
        {
          "when": "o.Order_Total * 1 > 500",
          "body": [
            "tag_high"
          ]
        }
      ],
      "default": []
    },
    {
      "id": "tag_new",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://us1.api.mailchimp.com/3.0/lists/aud_main/members/{{o.Email}}/tags",
        "body": {
          "tags": [
            {
              "name": "new-customer-2026",
              "status": "active"
            }
          ]
        }
      }
    },
    {
      "id": "tag_repeat",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://us1.api.mailchimp.com/3.0/lists/aud_main/members/{{o.Email}}/tags",
        "body": {
          "tags": [
            {
              "name": "repeat-customer",
              "status": "active"
            }
          ]
        }
      }
    },
    {
      "id": "tag_vip",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://us1.api.mailchimp.com/3.0/lists/aud_main/members/{{o.Email}}/tags",
        "body": {
          "tags": [
            {
              "name": "vip-eligible",
              "status": "active"
            }
          ]
        }
      }
    },
    {
      "id": "tag_high",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://us1.api.mailchimp.com/3.0/lists/aud_main/members/{{o.Email}}/tags",
        "body": {
          "tags": [
            {
              "name": "high-value",
              "status": "active"
            }
          ]
        }
      }
    },
    {
      "id": "collect",
      "type": "collect",
      "value": "{{o.Email}}",
      "stateKey": "summary"
    },
    {
      "id": "slack",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://slack.com/api/chat.postMessage",
        "body": {
          "channel": "CECOMOPS",
          "text": "Mailchimp sync complete: synced 3 buyers.\n{{loop_loop1.state.summary}}"
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch_orders"
    ],
    [
      "fetch_orders",
      "rows_orders"
    ],
    [
      "rows_orders",
      "fetch_optout"
    ],
    [
      "fetch_optout",
      "rows_optout"
    ],
    [
      "rows_optout",
      "join_optout"
    ],
    [
      "join_optout",
      "loop1"
    ],
    [
      "loop1",
      "slack"
    ]
  ]
},
  "operations.space_utilization_analysis": {
  "meta": {
    "task": "operations.space_utilization_analysis",
    "domain": "operations",
    "pattern": "P2",
    "bridge": "http://127.0.0.1:8765",
    "description": "扫描 41 行房间数据，按类型/占用率/备注/邮件证据筛选，逐间计算浪费座位并汇总，创建 Notion 报告并发邮件"
  },
  "nodes": [
    {
      "id": "fetch",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_space/values/Rooms!A1:Z200"
      },
      "out": "sheet"
    },
    {
      "id": "rows",
      "type": "rows",
      "items": "{{sheet.values}}",
      "out": "rooms"
    },
    {
      "id": "pick",
      "type": "filter",
      "items": "rooms",
      "when": "item.Type == 'Office' and item.Avg_Daily_Occupancy_ * 1 < 40 and not item.Notes.toLowerCase().contains('renovation') and not item.Notes.toLowerCase().contains('executive') and not item.Notes.toLowerCase().contains('decommissioned') and item.Room != '2B-105'",
      "out": "underused"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "underused",
      "itemVar": "c",
      "body": [
        "ratio",
        "used",
        "unused",
        "collect"
      ],
      "maxIterations": 50,
      "onError": "continue",
      "state": {
        "total": 0,
        "summary": ""
      },
      "checkpoint": {
        "every": 10,
        "keep": 20
      }
    },
    {
      "id": "ratio",
      "type": "compute",
      "left": "{{c.Avg_Daily_Occupancy_}}",
      "right": "100",
      "op": "divide",
      "out": "ratio",
      "format": "raw"
    },
    {
      "id": "used",
      "type": "compute",
      "left": "{{c.Capacity}}",
      "right": "{{ratio}}",
      "op": "multiply",
      "out": "used",
      "format": "money"
    },
    {
      "id": "unused",
      "type": "compute",
      "left": "{{c.Capacity}}",
      "right": "{{used}}",
      "op": "subtract",
      "out": "wasted",
      "format": "money",
      "accumulate": "total",
      "totalOut": "wasted_total",
      "totalFormat": "floor"
    },
    {
      "id": "collect",
      "type": "collect",
      "value": "{{c.Room}} (capacity {{c.Capacity}}, occupancy {{c.Avg_Daily_Occupancy_}}%)",
      "stateKey": "summary"
    },
    {
      "id": "notion",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://api.notion.com/v1/pages",
        "body": {
          "parent": {
            "workspace": true
          },
          "properties": {
            "title": {
              "title": [
                {
                  "text": {
                    "content": "Space Consolidation Report - Q1 2026"
                  }
                }
              ]
            }
          }
        }
      }
    },
    {
      "id": "encode",
      "type": "encode",
      "value": "Underutilized offices:\n{{loop_loop1.state.summary}}\nTotal wasted capacity: {{wasted_total}}",
      "out": "mail_b64"
    },
    {
      "id": "send",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "rachel.torres@company.example.com"
              },
              {
                "name": "Subject",
                "value": "Space Consolidation Report - Q1 2026"
              }
            ],
            "body": {
              "data": "{{mail_b64}}"
            }
          }
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch"
    ],
    [
      "fetch",
      "rows"
    ],
    [
      "rows",
      "pick"
    ],
    [
      "pick",
      "loop1"
    ],
    [
      "loop1",
      "notion"
    ],
    [
      "notion",
      "encode"
    ],
    [
      "encode",
      "send"
    ]
  ]
},
  "sales.overdue_followup_flag": {
  "meta": {
    "task": "sales.overdue_followup_flag",
    "domain": "sales",
    "pattern": "P5",
    "bridge": "http://127.0.0.1:8765",
    "today": "2026-02-26",
    "description": "按工作日规则判断逾期；Completed 需有完成备注；有 extension 备注的豁免；逐条建 OVERDUE 任务并汇总邮件"
  },
  "nodes": [
    {
      "id": "fetch_tasks",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/query",
        "params": {
          "q": "SELECT Id, Subject, Status, Description, ActivityDate, OwnerId, WhatId FROM Task"
        }
      },
      "out": "tasks"
    },
    {
      "id": "fetch_accounts",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/query",
        "params": {
          "q": "SELECT Id, Name FROM Account"
        }
      },
      "out": "accounts"
    },
    {
      "id": "fetch_notes",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/query",
        "params": {
          "q": "SELECT Id, Title, Body, ParentId FROM Note"
        }
      },
      "out": "notes"
    },
    {
      "id": "ext_notes",
      "type": "filter",
      "items": "{{notes.records}}",
      "when": "item.Body.toLowerCase().contains('extension')",
      "out": "ext_notes"
    },
    {
      "id": "join_acc",
      "type": "join",
      "items": "{{tasks.records}}",
      "with": "{{accounts.records}}",
      "leftKey": "WhatId",
      "rightKey": "Id",
      "fields": {
        "account_name": "Name"
      },
      "out": "tasks_joined"
    },
    {
      "id": "join_ext",
      "type": "join",
      "items": "tasks_joined",
      "with": "ext_notes",
      "leftKey": "Id",
      "rightKey": "ParentId",
      "setFound": "has_extension",
      "out": "tasks_ready"
    },
    {
      "id": "loop1",
      "type": "loop",
      "mode": "forEach",
      "items": "tasks_ready",
      "itemVar": "t",
      "body": [
        "days",
        "route"
      ],
      "maxIterations": 50,
      "onError": "continue",
      "state": {
        "summary": ""
      }
    },
    {
      "id": "days",
      "type": "businessdays",
      "from": "{{t.ActivityDate}}",
      "to": "{{meta.today}}",
      "out": "bdays"
    },
    {
      "id": "route",
      "type": "branch",
      "cases": [
        {
          "when": "(t.Status != 'Completed' or not t.Description.startsWith('Completed:')) and not t.has_extension and bdays > 3",
          "body": [
            "flag",
            "collect"
          ]
        }
      ],
      "default": []
    },
    {
      "id": "flag",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/sobjects/Task",
        "body": {
          "Subject": "OVERDUE: {{t.Subject}}",
          "Priority": "High",
          "Status": "Not Started",
          "Description": "Overdue follow-up for {{t.account_name}} — {{t.Subject}}",
          "OwnerId": "{{t.OwnerId}}"
        }
      }
    },
    {
      "id": "collect",
      "type": "collect",
      "value": "{{t.account_name}} — {{t.Subject}}",
      "stateKey": "summary"
    },
    {
      "id": "encode",
      "type": "encode",
      "value": "Overdue follow-ups:\n{{loop_loop1.state.summary}}",
      "out": "mail_b64"
    },
    {
      "id": "send",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        "body": {
          "payload": {
            "headers": [
              {
                "name": "To",
                "value": "ops-team@crestline.example.com"
              },
              {
                "name": "Subject",
                "value": "Overdue follow-ups"
              }
            ],
            "body": {
              "data": "{{mail_b64}}"
            }
          }
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch_tasks"
    ],
    [
      "fetch_tasks",
      "fetch_accounts"
    ],
    [
      "fetch_accounts",
      "fetch_notes"
    ],
    [
      "fetch_notes",
      "ext_notes"
    ],
    [
      "ext_notes",
      "join_acc"
    ],
    [
      "join_acc",
      "join_ext"
    ],
    [
      "join_ext",
      "loop1"
    ],
    [
      "loop1",
      "encode"
    ],
    [
      "encode",
      "send"
    ]
  ]
},
  "support.zendesk_sf_case_sync": {
  "meta": {
    "task": "support.zendesk_sf_case_sync",
    "benchmark": "support.zendesk_sf_case_sync",
    "domain": "support",
    "pattern": "P6/P4",
    "kind": "backup",
    "bridge": "http://127.0.0.1:8765",
    "description": "备用题补齐：三张配置表（blocklist/SLA/config）+ Zendesk 用户/组织 + Salesforce 联系人/账户/已有 case，先补全再 join，过滤出 5 条可同步 ticket，循环建 case + 评论，最后 Slack 汇总。只使用已有节点类型。"
  },
  "nodes": [
    {
      "id": "fetch_tickets",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.zendesk.com/api/v2/tickets"
      },
      "out": "tickets_raw"
    },
    {
      "id": "map_tickets",
      "type": "map",
      "items": "{{tickets_raw.tickets}}",
      "out": "tickets"
    },
    {
      "id": "candidates",
      "type": "filter",
      "items": "{{tickets}}",
      "when": "item.requester_id != null",
      "out": "candidates"
    },
    {
      "id": "fetch_users",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.zendesk.com/api/v2/users"
      },
      "out": "users_raw"
    },
    {
      "id": "map_users",
      "type": "map",
      "items": "{{users_raw.users}}",
      "out": "users"
    },
    {
      "id": "fetch_orgs",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.zendesk.com/api/v2/organizations"
      },
      "out": "orgs_raw"
    },
    {
      "id": "map_orgs",
      "type": "map",
      "items": "{{orgs_raw.organizations}}",
      "out": "orgs"
    },
    {
      "id": "fetch_contacts",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/query",
        "params": {
          "q": "SELECT Id, FirstName, LastName, Email, AccountId FROM Contact"
        }
      },
      "out": "contacts_raw"
    },
    {
      "id": "map_contacts",
      "type": "map",
      "items": "{{contacts_raw.records}}",
      "out": "contacts"
    },
    {
      "id": "fetch_cases",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/query",
        "params": {
          "q": "SELECT Id, Subject, AccountId, Priority, Origin FROM Case"
        }
      },
      "out": "cases_raw"
    },
    {
      "id": "map_cases",
      "type": "map",
      "items": "{{cases_raw.records}}",
      "out": "cases"
    },
    {
      "id": "fetch_accounts",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/query",
        "params": {
          "q": "SELECT Id, Name FROM Account"
        }
      },
      "out": "accounts_raw"
    },
    {
      "id": "map_accounts",
      "type": "map",
      "items": "{{accounts_raw.records}}",
      "out": "accounts"
    },
    {
      "id": "fetch_blocklist",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_blocklist/values/Blocked Orgs!A1:Z100"
      },
      "out": "blocklist_raw"
    },
    {
      "id": "rows_blocklist",
      "type": "rows",
      "items": "{{blocklist_raw.values}}",
      "out": "blocklist"
    },
    {
      "id": "fetch_sla",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_sla/values/SLA Tiers!A1:Z100"
      },
      "out": "sla_raw"
    },
    {
      "id": "rows_sla",
      "type": "rows",
      "items": "{{sla_raw.values}}",
      "out": "sla_tiers"
    },
    {
      "id": "fetch_config",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://sheets.googleapis.com/v4/spreadsheets/ss_config/values/Config!A1:Z100"
      },
      "out": "config_raw"
    },
    {
      "id": "rows_config",
      "type": "rows",
      "items": "{{config_raw.values}}",
      "out": "config"
    },
    {
      "id": "cfg_batch",
      "type": "filter",
      "items": "{{config}}",
      "when": "item.Setting == 'Batch_Reference'",
      "out": "cfg_batch_rows"
    },
    {
      "id": "first_batch",
      "type": "first",
      "items": "{{cfg_batch_rows}}",
      "out": "batch",
      "itemVar": "batch"
    },
    {
      "id": "cfg_platinum",
      "type": "filter",
      "items": "{{config}}",
      "when": "item.Setting == 'Priority_Rule_SLA_Platinum'",
      "out": "cfg_platinum_rows"
    },
    {
      "id": "first_platinum",
      "type": "first",
      "items": "{{cfg_platinum_rows}}",
      "out": "platinum",
      "itemVar": "platinum"
    },
    {
      "id": "cfg_enterprise",
      "type": "filter",
      "items": "{{config}}",
      "when": "item.Setting == 'Priority_Rule_Org_Tag_enterprise'",
      "out": "cfg_enterprise_rows"
    },
    {
      "id": "first_enterprise",
      "type": "first",
      "items": "{{cfg_enterprise_rows}}",
      "out": "enterprise_rule",
      "itemVar": "enterprise_rule"
    },
    {
      "id": "cfg_warning",
      "type": "filter",
      "items": "{{config}}",
      "when": "item.Setting == 'Priority_Rule_Blocklist_Warning'",
      "out": "cfg_warning_rows"
    },
    {
      "id": "first_warning",
      "type": "first",
      "items": "{{cfg_warning_rows}}",
      "out": "warning_rule",
      "itemVar": "warning_rule"
    },
    {
      "id": "join_users",
      "type": "join",
      "items": "{{candidates}}",
      "with": "users",
      "leftKey": "requester_id",
      "rightKey": "id",
      "fields": {
        "requester_email": "email",
        "requester_name": "name",
        "organization_id": "organization_id"
      },
      "out": "tickets_users"
    },
    {
      "id": "add_domain",
      "type": "map",
      "items": "{{tickets_users}}",
      "fields": {
        "id": "{{item.id}}",
        "subject": "{{item.subject}}",
        "status": "{{item.status}}",
        "priority": "{{item.priority}}",
        "requester_id": "{{item.requester_id}}",
        "requester_email": "{{item.requester_email}}",
        "requester_name": "{{item.requester_name}}",
        "organization_id": "{{item.organization_id}}",
        "domain": "{{item.requester_email.substring(item.requester_email.indexOf('@') + 1)}}"
      },
      "out": "tickets_domain"
    },
    {
      "id": "join_contacts",
      "type": "join",
      "items": "{{tickets_domain}}",
      "with": "contacts",
      "leftKey": "requester_email",
      "rightKey": "Email",
      "fields": {
        "account_id": "AccountId",
        "contact_id": "Id",
        "contact_first": "FirstName",
        "contact_last": "LastName"
      },
      "setFound": "contact_found",
      "out": "tickets_contacts"
    },
    {
      "id": "join_orgs",
      "type": "join",
      "items": "{{tickets_contacts}}",
      "with": "orgs",
      "leftKey": "organization_id",
      "rightKey": "id",
      "fields": {
        "org_tags": "tags"
      },
      "out": "tickets_orgs"
    },
    {
      "id": "join_blocklist",
      "type": "join",
      "items": "{{tickets_orgs}}",
      "with": "blocklist",
      "leftKey": "domain",
      "rightKey": "Domain",
      "fields": {
        "block_status": "Status"
      },
      "out": "with_block"
    },
    {
      "id": "join_sla",
      "type": "join",
      "items": "{{with_block}}",
      "with": "sla_tiers",
      "leftKey": "domain",
      "rightKey": "Domain",
      "fields": {
        "sla_tier": "SLA Tier"
      },
      "out": "with_sla"
    },
    {
      "id": "prepare",
      "type": "map",
      "items": "{{with_sla}}",
      "fields": {
        "id": "{{item.id}}",
        "subject": "{{item.subject}}",
        "status": "{{item.status}}",
        "priority": "{{item.priority}}",
        "requester_id": "{{item.requester_id}}",
        "requester_email": "{{item.requester_email}}",
        "requester_name": "{{item.requester_name}}",
        "account_id": "{{item.account_id}}",
        "contact_id": "{{item.contact_id}}",
        "contact_found": "{{item.contact_found}}",
        "organization_id": "{{item.organization_id}}",
        "org_tags": "{{item.org_tags}}",
        "domain": "{{item.requester_email.substring(item.requester_email.indexOf('@') + 1)}}",
        "case_priority": "{{item.block_status == 'Warning' ? warning_rule.Value : (item.sla_tier == 'Platinum' ? platinum.Value : ((item.org_tags != null and item.org_tags.contains('enterprise')) ? enterprise_rule.Value : (item.priority == 'urgent' or item.priority == 'high' ? 'High' : (item.priority == 'normal' ? 'Medium' : 'Low'))))}}"
      },
      "out": "prepared"
    },
    {
      "id": "join_existing",
      "type": "join",
      "items": "{{prepared}}",
      "with": "cases",
      "leftKey": "subject",
      "rightKey": "Subject",
      "setFound": "duplicate",
      "out": "with_duplicate"
    },
    {
      "id": "join_accounts",
      "type": "join",
      "items": "{{with_duplicate}}",
      "with": "accounts",
      "leftKey": "account_id",
      "rightKey": "Id",
      "fields": {
        "account_name": "Name"
      },
      "out": "enriched"
    },
    {
      "id": "ready",
      "type": "filter",
      "items": "{{enriched}}",
      "when": "item.status == 'new' and item.contact_found and item.account_id != null and (item.block_status == null or item.block_status != 'Blocked') and not item.duplicate",
      "out": "ready_tickets"
    },
    {
      "id": "count_ready",
      "type": "aggregate",
      "items": "{{ready_tickets}}",
      "op": "count",
      "out": "created_count"
    },
    {
      "id": "count_total",
      "type": "aggregate",
      "items": "{{candidates}}",
      "op": "count",
      "out": "total_tickets"
    },
    {
      "id": "skipped",
      "type": "compute",
      "left": "{{total_tickets}}",
      "right": "{{created_count}}",
      "op": "subtract",
      "out": "skipped_count",
      "format": "int"
    },
    {
      "id": "loop_cases",
      "type": "loop",
      "mode": "forEach",
      "items": "{{ready_tickets}}",
      "itemVar": "t",
      "body": [
        "create_case",
        "comment_case",
        "collect_accounts",
        "collect_priorities"
      ],
      "maxIterations": 20,
      "onError": "continue",
      "checkpoint": {
        "every": 1,
        "keep": 20
      }
    },
    {
      "id": "create_case",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/sobjects/Case",
        "body": {
          "Subject": "{{t.subject}}",
          "Description": "Created from Zendesk ticket {{t.id}}",
          "AccountId": "{{t.account_id}}",
          "Priority": "{{t.case_priority}}",
          "Origin": "Web",
          "Status": "New"
        }
      }
    },
    {
      "id": "comment_case",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "PUT",
        "url": "https://yourinstance.zendesk.com/api/v2/tickets/{{t.id}}",
        "body": {
          "ticket": {
            "comment": {
              "body": "Synced to Salesforce for account {{t.account_name}} (priority {{t.case_priority}}).",
              "public": false
            }
          }
        }
      }
    },
    {
      "id": "collect_accounts",
      "type": "collect",
      "stateKey": "account_names",
      "value": "{{t.account_name}}"
    },
    {
      "id": "collect_priorities",
      "type": "collect",
      "stateKey": "priorities",
      "value": "{{t.case_priority}}"
    },
    {
      "id": "fetch_cases_after",
      "type": "fetch",
      "tool": "api_fetch",
      "args": {
        "method": "GET",
        "url": "https://yourinstance.salesforce.com/services/data/v61.0/query",
        "params": {
          "q": "SELECT Id, Subject, AccountId, Priority, Origin FROM Case"
        }
      },
      "out": "cases_after"
    },
    {
      "id": "assert_count",
      "type": "assert",
      "expr": "cases_after.totalSize == 6",
      "message": "Salesforce case 总数应为 6（1 条已有 + 5 条新建）"
    },
    {
      "id": "slack_summary",
      "type": "action",
      "tool": "api_fetch",
      "args": {
        "method": "POST",
        "url": "https://slack.com/api/chat.postMessage",
        "body": {
          "channel": "support-sync",
          "text": "Zendesk to Salesforce sync {{batch.Value}} complete: {{created_count}} cases created, {{skipped_count}} skipped.\nAccounts: {{loop_loop_cases.state.account_names}}\nPriorities: {{loop_loop_cases.state.priorities}}"
        }
      }
    }
  ],
  "edges": [
    [
      "start",
      "fetch_tickets"
    ],
    [
      "fetch_tickets",
      "map_tickets"
    ],
    [
      "map_tickets",
      "candidates"
    ],
    [
      "candidates",
      "fetch_users"
    ],
    [
      "fetch_users",
      "map_users"
    ],
    [
      "map_users",
      "fetch_orgs"
    ],
    [
      "fetch_orgs",
      "map_orgs"
    ],
    [
      "map_orgs",
      "fetch_contacts"
    ],
    [
      "fetch_contacts",
      "map_contacts"
    ],
    [
      "map_contacts",
      "fetch_cases"
    ],
    [
      "fetch_cases",
      "map_cases"
    ],
    [
      "map_cases",
      "fetch_accounts"
    ],
    [
      "fetch_accounts",
      "map_accounts"
    ],
    [
      "map_accounts",
      "fetch_blocklist"
    ],
    [
      "fetch_blocklist",
      "rows_blocklist"
    ],
    [
      "rows_blocklist",
      "fetch_sla"
    ],
    [
      "fetch_sla",
      "rows_sla"
    ],
    [
      "rows_sla",
      "fetch_config"
    ],
    [
      "fetch_config",
      "rows_config"
    ],
    [
      "rows_config",
      "cfg_batch"
    ],
    [
      "cfg_batch",
      "first_batch"
    ],
    [
      "first_batch",
      "cfg_platinum"
    ],
    [
      "cfg_platinum",
      "first_platinum"
    ],
    [
      "first_platinum",
      "cfg_enterprise"
    ],
    [
      "cfg_enterprise",
      "first_enterprise"
    ],
    [
      "first_enterprise",
      "cfg_warning"
    ],
    [
      "cfg_warning",
      "first_warning"
    ],
    [
      "first_warning",
      "join_users"
    ],
    [
      "join_users",
      "add_domain"
    ],
    [
      "add_domain",
      "join_contacts"
    ],
    [
      "join_contacts",
      "join_orgs"
    ],
    [
      "join_orgs",
      "join_blocklist"
    ],
    [
      "join_blocklist",
      "join_sla"
    ],
    [
      "join_sla",
      "prepare"
    ],
    [
      "prepare",
      "join_existing"
    ],
    [
      "join_existing",
      "join_accounts"
    ],
    [
      "join_accounts",
      "ready"
    ],
    [
      "ready",
      "count_ready"
    ],
    [
      "count_ready",
      "count_total"
    ],
    [
      "count_total",
      "skipped"
    ],
    [
      "skipped",
      "loop_cases"
    ],
    [
      "loop_cases",
      "fetch_cases_after"
    ],
    [
      "fetch_cases_after",
      "assert_count"
    ],
    [
      "assert_count",
      "slack_summary"
    ]
  ]
},
};
