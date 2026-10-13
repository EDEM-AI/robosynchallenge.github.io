/** Organizer-only MailApp delivery for registered teams, including teams without a request. */
function reviewSendRegistrationNotice_(payload) {
  return withReviewLock_(() => {
    const viewer = reviewerIdentity_(payload);
    if (viewer.role !== "admin") throw new Error("Organizer access required.");
    const email = requiredEmail_(payload.email), id = String(payload.delivery_id || "");
    if (!/^notice_[a-f0-9]{32}$/.test(id)) throw new Error("Use a stable delivery ID.");
    const user = rows_("Users").find(row => normalizeEmail_(row.email) === email && String(row.token_status) === "active");
    if (!user) throw new Error("Recipient must be an active registered participant.");
    if (latestReviewSubmissions_().some(job => normalizeEmail_(job.submission.email) === email)) throw new Error("Use the request-specific notice for a participant with an evaluation request.");
    const properties = PropertiesService.getScriptProperties(), key = "REVIEW_REGISTRATION_NOTICE_" + id;
    const previous = parseJson_(properties.getProperty(key), null);
    if (previous) {
      if (previous.email !== email) throw new Error("Delivery ID belongs to another participant.");
      if (previous.status === "sent") return {ok:true, duplicate:true, ...previous};
      throw new Error("Check sent mail before retrying an uncertain delivery.");
    }
    const quota = MailApp.getRemainingDailyQuota();
    if (quota < 1) return {ok:true, status:"not_sent", transport:"mailapp", reason:"Daily MailApp quota exhausted", remaining_quota:quota};
    const team = String(user.team_name || "your");
    const body = `Dear ${team} team,\n\nThank you for registering for RoboSynChallenge and for your interest in the competition.\n\nYour team registration is on record, but we have not received an eligible evaluation request for your team for the preliminary round.\n\nWe appreciate your interest and hope you will continue to follow the challenge, its results and future updates. We look forward to further opportunities to connect with you.\n\nIf you believe a request submitted before the applicable deadline is missing from our records, please reply with its evaluation ID or submission confirmation so that we can check. This notice does not reopen submissions.\n\nThank you again for being part of the RoboSynChallenge community.\n\nBest regards,\nRoboSynChallenge Organizing Team`;
    const receipt = {email, team_name:team, transport:"mailapp", status:"sending", created_at:now_()};
    properties.setProperty(key, JSON.stringify(receipt));
    try {
      MailApp.sendEmail({to:email, replyTo:config_("CONTACT_EMAIL", "robosynchallenge@gmail.com"),
        subject:"RoboSynChallenge - thank you for registering", body,
        htmlBody:htmlEmailShell_("Thank you for registering", body.split("\n\n").map(part => "<p>" + escapeHtml_(part).replace(/\n/g,"<br>") + "</p>").join(""))});
      receipt.status = "sent"; receipt.sent_at = now_();
      properties.setProperty(key, JSON.stringify(receipt));
      return {ok:true, ...receipt};
    } catch (error) {
      receipt.status = "delivery_unknown";
      properties.setProperty(key, JSON.stringify(receipt));
      throw new Error("MailApp delivery needs organizer verification before retrying.");
    }
  });
}
