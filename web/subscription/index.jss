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

const uid = await include("../uid.jss");
if (!uid) return;

const config = require("../config.js");
const db = require("../db.js").db;
const creditsj = await include("../credits.jss");

const accountCredits = await creditsj.accountCredits(uid);

await include("../head.jss", {title: "Subscription"});

// General function for generating subscription buttons
async function genSub(level) {
    var sub = {
        plan_id: config.paypal.subscription[level].id,
        application_context: {
            shipping_preference: "NO_SHIPPING"
        }
    };

    ?>
    <div id="paypal-button-container-<?JS= level ?>"></div>

    <script type="text/javascript">
        paypal.Buttons({
            createSubscription: function(data, actions) {
                return actions.subscription.create(<?JS= JSON.stringify(sub) ?>);
            },

            onApprove: function(data, actions) {
                try {
                    document.getElementById("sub-box").innerHTML = "Loading...";
                } catch (ex) {}
                return fetch("/panel/subscription/paypal/", {
                    method: "POST",
                    headers: {"content-type": "application/json"},
                    body: JSON.stringify({id:data.subscriptionID})
                    
                }).then(function(res) {
                    return res.json();

                }).then(function(res) {
                    if (!res.success) {
                        alert("Subscription failed! Details: " + res.reason);
                        return;
                    }

                }).catch(function(ex) {
                }).then(function() {
                    document.location.reload();
                });
            }

        }).render('#paypal-button-container-<?JS= level ?>');
    </script>
    <?JS
}

// We do something different if they already have a subscription

if (accountCredits.subscription) {
?>

    <section class="wrapper special">
        <h2>Subscription</h2>

        <p>You have a<?JS= [" "," basic","n HQ"][accountCredits.subscription] ?> subscription until <?JS= accountCredits.subscription_expiry ?> UTC. Thanks!</p>

        <p>(If you have canceled your subscription, you still get to keep the remainder of your subscription time, and so are still subscribed until the expiry date above.)</p>
    </section>

<?JS } else { ?>

    <section class="wrapper special" id="sub-box">
        <script type="text/javascript" src="https://www.paypal.com/sdk/js?client-id=<?JS= config.paypal.clientId ?>&vault=true"></script>

        <h2>Basic subscription</h2>
        <p>$<?JS= config.subscription.basic/100 ?>/month, unlimited recordings in 128kbit Opus</p>
        <?JS await genSub("basic"); ?>

        <hr/>

        <h2>HQ subscription</h2>
        <p>$<?JS= config.subscription.hq/100 ?>/month, unlimited recordings in lossless FLAC and/or continuous mode</p>
        <?JS await genSub("hq"); ?>
    </section>

<?JS
}

await include("../../tail.jss");
?>
