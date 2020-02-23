<?JS
/*
 * Copyright (c) 2020 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const uid = await include("../../uid.jss");
if (!uid) return;

const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const edb = require("../db.js");
const db = edb.db;
const log = edb.log;
const credits = require("../credits.js");
const login = await include("../../login/login.jss");

const maxCredits = 3600 * 24;

if (!request.body || !request.body.id) {
    writeHead(500);
    write("{\"success\":false}");
    return;
}

writeHead(200, {"content-type": "application/json"});

function fail(reason) {
    write(JSON.stringify({success: false, reason}));
}

const authorization = "Basic " + Buffer.from(config.paypal.clientId + ":" + config.paypal.secret).toString("base64");

// Get the order details
var order = await nrc.getPromise("https://api.paypal.com/v2/checkout/orders/" + request.body.id, {
    headers: {
        "content-type": "application/json",
        authorization
    }
});
order = order.data;

// Get the amount of the order
var value;
try {
    value = order.purchase_units[0].amount.value;
    if (order.purchase_units[0].amount.currency_code !== "USD" ||
        order.status !== "APPROVED")
        throw new Error();
} catch (ex) {
    return fail("Invalid order data");
}

// This is our only opportunity to remember email addresses for PayPal users
try {
    await login.setEmail(uid, order.payer.email_address);
} catch (ex) {}

// Convert to cents
if (!/^([0-9])+\.[0-9][0-9]$/.test(value)) {
    // Not in the expected format???
    return fail("Invalid purchase value");
}

value = Number.parseInt(value.replace(".", ""), 10);
if (value < 200)
    return fail("Invalid purchase value");

// Figure out how many credits they just bought
var purchased = credits.centsToCredits(value);

// Add the credits to the user's account
while (true) {
    try {
        await db.runP("BEGIN TRANSACTION;");

        // Make sure the user has defined credits
        var row = await db.getP("SELECT credits FROM credits WHERE uid=@UID;", {"@UID": uid});
        if (row) {
            // Make sure they don't have too many credits
            if (row.credits + purchased > maxCredits) {
                await db.runP("COMMIT;");
                return fail("You may not have more than 24 hours worth of credit");
            }
        } else {
            await db.runP("INSERT INTO credits (uid, credits, purchased) VALUES (@UID, 0, 0);", {"@UID": uid});
        }

        // Then update it
        await db.runP("UPDATE credits SET credits=credits+@V, purchased=purchased+@V WHERE uid=@UID;", {
            "@UID": uid,
            "@V": purchased
        });

        await db.runP("COMMIT;");
        break;
    } catch (ex) {
        await db.runP("ROLLBACK;");
    }
}

// Now capture the purchase
var capture = await nrc.postPromise("https://api.paypal.com/v2/checkout/orders/" + request.body.id + "/capture", {
    headers: {
        "content-type": "application/json",
        authorization
    },
    parameters: {}
});
capture = capture.data;

if (capture.status !== "COMPLETED") {
    // Something went wrong! Undo! Abort! Roll back!
    while (true) {
        try {
            await db.runP("BEGIN TRANSACTION;");
            await db.runP("UPDATE credits SET credits=max(credits-@V,0), purchased=max(purchased-@V,0) WHERE uid=@UID;", {
                "@UID": uid,
                "@V": purchased
            });
            await db.runP("COMMIT;");
            break;
        } catch (ex) {
            await db.runP("ROLLBACK;");
        }
    }
    return fail("Failed to finalize transaction");
}

log("purchased-credits", JSON.stringify(order), {uid});

// FIXME: Validation!
write("{\"success\":true}");
?>
