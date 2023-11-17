const express = require("express");
var path = require("path");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
const cors = require("cors");
const colors = require("colors");
const crypto = require("crypto");
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");
var MyInfoConnector = require("myinfo-connector-v4-nodejs");
const fs = require("fs");

const app = express();
const config = require("./config/config.js");
const port = config.PORT || 3001;
const connector = new MyInfoConnector(config.MYINFO_CONNECTOR_CONFIG);

var sessionIdCache = {};

app.use(cors());

app.set("views", path.join(__dirname, "public/views"));
app.set("view engine", "pug");

app.use(express.static("public"));

app.use(bodyParser.json({ limit: "500mb" }));
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "500mb",
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/", function (req, res) {
  res.sendFile(__dirname + `/public/index.html`);
});

app.get("/manual-fill", function (req, res) {
  res.sendFile(__dirname + `/public/profile2.html`);
});

app.post("/redirect", (req, res) => {
  res.redirect("/profile");
});

app.get("/profile", (req, res) => {
  res.sendFile(__dirname + `/public/profile.html`);
});

// get the environment variables (app info) from the config
app.get("/getEnv", function (req, res) {
  try {
    if (
      config.APP_CONFIG.DEMO_APP_CLIENT_ID == undefined ||
      config.APP_CONFIG.DEMO_APP_CLIENT_ID == null
    ) {
      res.status(500).send({
        error: "Missing Client ID",
      });
    } else {
      res.status(200).send({
        clientId: config.APP_CONFIG.DEMO_APP_CLIENT_ID,
        redirectUrl: config.APP_CONFIG.DEMO_APP_CALLBACK_URL,
        scope: config.APP_CONFIG.DEMO_APP_SCOPES,
        purpose_id: config.APP_CONFIG.DEMO_APP_PURPOSE_ID,
        authApiUrl: config.APP_CONFIG.MYINFO_API_AUTHORIZE,
        subentity: config.APP_CONFIG.DEMO_APP_SUBENTITY_ID,
      });
    }
  } catch (error) {
    console.log("Error".red, error);
    res.status(500).send({
      error: error,
    });
  }
});

// callback function - directs back to home page
app.get("/callback", function (req, res) {
  res.sendFile(__dirname + `/public/profile.html`);
});
// // callback function - directs back to home page
// app.get("/callback", function (req, res) {
//   res.sendFile(__dirname + `/public/index.html`);
// });

//function to read multiple files from a directory
function readFiles(dirname, onFileContent, onError) {
  fs.readdir(dirname, function (err, filenames) {
    if (err) {
      onError(err);
      return;
    }
    filenames.forEach(function (filename) {
      fs.readFile(dirname + filename, "utf8", function (err, content) {
        if (err) {
          onError(err);
          return;
        }
        onFileContent(filename, content);
      });
    });
  });
}

// getPersonData function - call MyInfo Token + Person API
app.post("/getPersonData", async function (req, res, next) {
  try {
    // get variables from frontend
    var authCode = req.body.authCode;
    //retrieve code verifier from session cache
    var codeVerifier = sessionIdCache[req.cookies.sid];
    console.log("Calling MyInfo NodeJs Library...".green);

    // retrieve private siging key and decode to utf8 from FS
    let privateSigningKey = fs.readFileSync(
      config.APP_CONFIG.DEMO_APP_CLIENT_PRIVATE_SIGNING_KEY,
      "utf8"
    );

    let privateEncryptionKeys = [];
    // retrieve private encryption keys and decode to utf8 from FS, insert all keys to array
    readFiles(
      config.APP_CONFIG.DEMO_APP_CLIENT_PRIVATE_ENCRYPTION_KEYS,
      (filename, content) => {
        privateEncryptionKeys.push(content);
      },
      (err) => {
        throw err;
      }
    );

    //call myinfo connector to retrieve data
    let personData = await connector.getMyInfoPersonData(
      authCode,
      codeVerifier,
      privateSigningKey,
      privateEncryptionKeys
    );

    /* 
      P/s: Your logic to handle the person data ...
    */
    console.log(
      "--- Sending Person Data From Your-Server (Backend) to Your-Client (Frontend)---:"
        .green
    );
    console.log(JSON.stringify(personData)); // log the data for demonstration purpose only
    res.status(200).send(personData); //return personData
  } catch (error) {
    console.log("---MyInfo NodeJs Library Error---".red);
    console.log(error);
    res.status(500).send({
      error: error,
    });
  }
});

// Generate the code verifier and code challenge for PKCE flow
app.post("/generateCodeChallenge", async function (req, res, next) {
  try {
    // call connector to generate code_challenge and code_verifier
    let pkceCodePair = connector.generatePKCECodePair();
    // create a session and store code_challenge and code_verifier pair
    let sessionId = crypto.randomBytes(16).toString("hex");
    sessionIdCache[sessionId] = pkceCodePair.codeVerifier;

    //establish a frontend session with browser to retrieve back code_verifier
    res.cookie("sid", sessionId);
    //send code code_challenge to frontend to make /authorize call
    res.status(200).send(pkceCodePair.codeChallenge);
  } catch (error) {
    console.log("Error".red, error);
    res.status(500).send({
      error: error,
    });
  }
});

app.post("/generatePDF", async (req, res) => {
  const data1 = req.body;

  const data = data1.formData;

  let cpfDataCheck = data1.cpfContributionPdf;

  let cpfData = "";

  let pageBreak = "";

  if (cpfDataCheck !== "" && cpfDataCheck !== undefined) {
    cpfData = `<p class="s1" style="padding-top:8pt;padding-bottom:8pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">CPF Contributions History (up to 15 months)</p>
    <table style="border-collapse:separate;margin-left:5pt;border: 1px solid #000;border-spacing: 4px; width: 100%;" cellspacing="0">
    <tr style="height:20pt">
    <td
        style="width:96pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt">
        <p class="s5" style="padding-top: 3pt;padding-left: 19pt;text-indent: 0pt;text-align: left;">For Month
        </p>
    </td>
    <td
        style="width:107pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt">
        <p class="s5" style="padding-top: 3pt;padding-left: 33pt;text-indent: 0pt;text-align: left;">Paid On</p>
    </td>
    <td
        style="width:105pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt">
        <p class="s5" style="padding-top: 3pt;padding-left: 22pt;text-indent: 0pt;text-align: left;">Amount ($)
        </p>
    </td>
    <td
        style="width:198pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt">
        <p class="s5" style="padding-top: 3pt;padding-left: 36pt;text-indent: 0pt;text-align: left;">Employer
            Contribution</p>
    </td>
    </tr>
    ${data1.cpfContributionPdf}
    </table>`;

    pageBreak = 'class="page-break"';
  }

  //   console.log("cpf", cpfData);
  let assessmentDataCheck = data1.cpfAssesmentPdf;
  let assessmentData = "";

  if (assessmentDataCheck.trim() !== "" && assessmentDataCheck !== null) {
    assessmentData = `<p class="s1" style="padding-bottom:5pt;padding-top: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">Notice of Assessment
    (Detailed, Last 2 years)</p>
    <table style="border-collapse:separate;margin-left:5pt;border: 1px solid #000;border-spacing: 4px; width: 100%;" cellspacing="0">
    ${data1.cpfAssesmentPdf}
    </table>
    `;
  }

  console.log("assessmentData", assessmentData);
  //   console.log(data1);

  // Generate PDF
  const pdfBuffer = await generatePDF(data, cpfData, assessmentData, pageBreak);

  // Send the generated PDF to the client
  res.contentType("application/pdf");
  res.send(pdfBuffer);
});

async function generatePDF(data, cpfData, assessmentData, pageBreak) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Create HTML content with form data
  const htmlContent = `
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDF Document</title>
  <style>
  * {
  margin: 0;
  padding: 0;
  text-indent: 0;
}

.s1 {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 14.5pt;
}

p {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 12pt;
  margin: 0pt;
}

.s2 {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 9.5pt;
}

.s3 {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 11pt;
}

.s4 {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 1.5pt;
}

a {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 9.5pt;
}

.s5 {
  color: black;
  font-family: "Trebuchet MS", sans-serif;
  font-style: normal;
  font-weight: bold;
  text-decoration: none;
  font-size: 11pt;
}

.s6 {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 11pt;
}

.s7 {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 11pt;
  vertical-align: 1pt;
}

.s8 {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 12pt;
}

li {
  display: block;
}

#l1 {
  padding-left: 0pt;
}

#l1>li>*:first-child:before {
  content: "• ";
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 11pt;
}

li {
  display: block;
}

#l2 {
  padding-left: 0pt;
}

#l2>li>*:first-child:before {
  content: "• ";
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 11pt;
}

table,
tbody {
  vertical-align: top;
  overflow: visible;
}
.sgp-application-form-wrapper {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px 0;
}
.top-table {
  width: 100%;
  padding-bottom: 5px;
  border-bottom: 1px solid #ccc;
}
.top-meta-wrapper {
  margin-left: 200px;
  padding: 20px 0 20px 30px;
  border-left: 2px solid #ccc;
}
.input-field-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 40px;
}
.input-field-grid-one {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
}
label {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 12.5pt;
  padding-left: 5pt;
}
input {
  display: block;
  width: 100%;
  padding: 2px 15px;
  border: 1px solid #666;
  margin-left: 5pt;
  margin-top: 5pt;
  box-sizing: border-box;
}
input.lg-input {
  padding: 15px;
}
input:focus-visible {
  outline: none;
}
input::placeholder {
  color: #000;
  opacity: 1;
}
.text-field-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 40px;
}
.text-field-item > p {
  color: black;
  font-family: "Segoe UI Symbol", sans-serif;
  font-style: normal;
  font-weight: normal;
  text-decoration: none;
  font-size: 12.5pt;
  margin-left: 5pt;
  padding-bottom: 5pt;
  border-bottom: 2px solid #ccc;
  width: 100%;
}
.page-break {
    page-break-before: always;
  }
    @media print {
      body {
        margin: 20mm;
      }
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
<div class="sgp-application-form-wrapper">
<table class="top-table" border="0" cellspacing="0" cellpadding="0">
    <tr>
        <td width="196"><img width="196" height="65" style="padding-top: 20px;"
            src="data:image/png;base64,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" />
        </td>
        <td>
            <img width="130" height="39" style="padding-top: 45px;margin-left: 20px;"
                src="data:image/png;base64,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" />
        </td>
        <td>
            <div class="top-meta-wrapper">
                <p style="margin-bottom: 4pt;text-indent: 0pt;line-height: 13pt;text-align: left;">
                    <a name="bookmark0">
                        <span style=" color: black; font-family:&quot;Segoe UI Symbol&quot;, sans-serif; font-style: normal; font-weight: normal; text-decoration: none; font-size: 10.5pt;">Customer
                        Loan</span>
                    </a>
                </p>
                <span style=" color: black; font-family:&quot;Segoe UI Symbol&quot;, sans-serif; font-style: normal; font-weight: normal; text-decoration: none; font-size: 15pt;">Application
                    Form</span>
            </div>
        </td>
    </tr>
</table>
</span><span
style=" color: black; font-family:&quot;Times New Roman&quot;, serif; font-style: normal; font-weight: normal; text-decoration: none; font-size: 10pt;">
</span></p>
<p style="padding-left: 5pt;text-indent: 0pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p style="text-indent: 0pt;text-align: left;"><span>
</span></p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">Loan Details</p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid">
<div class="field-item">
    <label for="loan-amount">Loan amount (SGD)</label>
    <input id="loan-amount" type="text" value="${data.loanAmount}" name="loan-amount" placeholder="1000">
</div>
<div class="field-item">
    <label for="renovation-loan">Main Purpose for Loan</label>
    <input id="renovation-loan" value="${data.loanPurpose}" type="text" name="renovation-loan" placeholder="Renovation Loan">
</div>
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid-one">
<div class="field-item">
    <label for="moneylender">Do you have any outstanding with other moneylender?</label>
    <input id="moneylender" type="text" value="${data.moneylender}" name="moneylender" placeholder="No">
</div>
</div>
</p>

<p style="padding-left: 5pt;text-indent: 0pt;line-height: 13pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p style="padding-left: 5pt;text-indent: 0pt;line-height: 1pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p class="s1" style="padding-top: 2pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">General Information</p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid">
<div class="field-item">
    <label for="NRIC">NRIC/FIN</label>
    <input id="NRIC" value="${data.uinfin}" type="text" name="NRIC" placeholder="S7380725E">
</div>
<div class="field-item">
    <label for="name">Name</label>
    <input id="name" type="text" value="${data.name}" name="name" placeholder="RATAN SHIVALI JOSHI">
</div>
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="field-item">
    <label for="nationality">Nationality</label>
    <input id="nationality" value="${data.nationality}" type="text" name="nationality" placeholder="SINGAPORE CITIZEN">
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid">
<div class="field-item">
    <label for="gender">Gender</label>
    <input id="gender" value="${data.sex}" type="text" name="gender" placeholder="MALE">
</div>
<div class="field-item">
    <label for="d-o-b">Date of Birth</label>
    <input id="d-o-b" value="${data.dob}" type="text" name="d-o-b" placeholder="1973-08-09">
</div>
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid">
<div class="field-item">
    <label for="race">Race</label>
    <input id="race" value="${data.race}" type="text" name="race" placeholder="INDIAN">
</div>
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="text-field-grid">
<div class="text-field-item">
    <p>Name of Employer: ${data.name_of_employer}</p>
</div>
<div class="text-field-item">
    <p>Occupation: ${data.occupation}</p>   
</div>
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid">
<div class="field-item">
    <label for="marital-status">Marital Status</label>
    <input id="marital-status" value="${data.marital}" type="text" name="marital-status" placeholder="MARRIED">
</div>
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid">
<div class="field-item">
    <label for="type-of-housing">Type of Housing</label>
    <input id="type-of-housing" value="${data.housingtype}" type="text" name="type-of-housing" placeholder="">
</div>
<div class="field-item">
    <label for="private-residential">Ownership of Private Residential Property</label>
    <input id="private-residential" value="${data.ownerprivate}" type="text" name="private-residential" placeholder="No">
</div>
</div>
</p>


<p style="padding-left: 5pt;text-indent: 0pt;line-height: 13pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p style="padding-left: 5pt;text-indent: 0pt;line-height: 1pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p class="s1" style="padding-top: 2pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">Employment Detail (For Work Pass Holder)</p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="text-field-grid">
<div class="text-field-item">
    <p>Pass Type: ${data.pass_type}</p>
</div>
<div class="text-field-item">
    <p>Pass Status: ${data.pass_status}</p>   
</div>
</div>
</p>
<p ${pageBreak}>

<p style="padding-left: 5pt;text-indent: 0pt;line-height: 13pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p style="padding-left: 5pt;text-indent: 0pt;line-height: 1pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p style="padding-left: 5pt;text-indent: 0pt;line-height: 13pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p style="padding-left: 5pt;text-indent: 0pt;line-height: 1pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p class="s1" style="padding-top: 2pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">Contact details</p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid">
<div class="field-item">
    <label for="mobile-number">Mobile Number</label>
    <input id="mobile-number" value="${data.mobileno}" type="text" name="mobile-number" placeholder="+6594891920">
</div>
<div class="field-item">
    <label for="email-address">Email Address</label>
    <input id="email-address" value="${data.email}" type="text" name="email-address" placeholder="myinfo34633@gmail.com">
</div>
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-top: 2pt;padding-bottom: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">
<div class="input-field-grid-one">
<div class="field-item">
    <label for="registered-address">Registered Address</label>
    <input class="lg-input" value="${data.regadd}" id="registered-address" type="text" name="registered-address" placeholder="148 HDB-BUKIT PANJANG #08-106 GANGSA ROAD Singapore 670148">
</div>
</div>
</p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p class="s1" style="padding-top: 11pt;padding-left: 5pt;text-indent: 0pt;text-align: left;"></p>
<p style="padding-left: 5pt;text-indent: 0pt;text-align: left;" />
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p class="s1" style="padding-top: 3pt;padding-left: 5pt;text-indent: 0pt;text-align: left;">HDB Ownership</p>
<p style="text-indent: 0pt;text-align: left; line-height: 10px;"><br /></p>
<table style="border-collapse:separate;margin-left:5pt;border: 1px solid #000;border-spacing: 4px; width: 100%;" cellspacing="0">
<tr style="height:auto">
<td
    style="width:67pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt;padding:2pt;vertical-align: middle;">
    <p class="s5" style="padding-left: 10pt;text-indent: 0pt;text-align: left;">Address</p>
</td>
<td
    style="width:52pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt;padding:2pt;vertical-align: middle;">
    <p class="s5" style="padding-top: 0pt;padding-left: 4pt;text-indent: 4pt;text-align: left;">Property Owner</p>
</td>
<td
    style="width:62pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt;padding:2pt;vertical-align: middle;">
    <p class="s5"
        style="padding-top: 0pt;padding-left: 5pt;padding-right: 4pt;text-indent: 0pt;text-align: center;">
        Type of HDB Dwelling</p>
</td>

</tr>
<tr style="height:auto">
<td
    style="width:67pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt;padding:2pt; vertical-align: middle;">
    <p class="s6"
        style="padding-top: 0pt;padding-left: 3pt;padding-right: 13pt;text-indent: 0pt;line-height: 16px;text-align: left;">
        ${data.regadd}</p>
</td>
<td
    style="width:52pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt;padding:2pt; vertical-align: middle;">
    <p class="s6" style="padding-left: 3pt;text-indent: 0pt;text-align: left;">${data.ownerprivate}</p>
</td>
<td
    style="width:62pt;border-top-style:solid;border-top-width:1pt;border-left-style:solid;border-left-width:1pt;border-bottom-style:solid;border-bottom-width:1pt;border-right-style:solid;border-right-width:1pt;padding:2pt; vertical-align: middle;">
    <p class="s6"
        style="padding-left: 3pt;padding-right: 14pt;text-indent: 0pt;line-height: 16px;text-align: left;">
        ${data.hdbtype}</p>
</td>
</tr>
</table>
<p style="text-indent: 0pt;text-align: left;"><br /></p>
${cpfData}
<p ${pageBreak}>
<p style="text-indent: 0pt;text-align: left;"><br /></p>
${assessmentData}
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p class="s7" style="padding-top: 10pt;padding-left: 0pt;text-indent: -15pt;line-height: 18px;text-align: left; display: flex; align-items: first baseline;">
<input type="checkbox" style="display: inline-block; width: auto; margin-right: 10pt;" checked="true">
<span class="s8">I authorise EZ Pte Ltd to conduct credit checks and verify information given in this
application with the following companies/organizations or parties without prior reference to me:
Moneylenders Credit Bureau (MLCB), Singapore Commercial Credit Bureau (SCCB), Registry of
Moneylenders.</span></p>
<p style="text-indent: 0pt;text-align: left;"><br /></p>
<p style="padding-left: 25pt;text-indent: 0pt;line-height: 18px;text-align: left;">I understand and agree that
some/all information is to be submitted to MLCB for the purpose of producing a credit report and the information
may be disclosed by MLCB to the Registry of Moneylenders and any public agency (when deemed necessary by the
Registry of Moneylenders).</p>
</div>
</body>
</html>

  `;

  // Set the content of the page with the HTML
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  // Generate PDF
  const pdfBuffer = await page.pdf({ format: "A4" });

  // Close the browser
  await browser.close();

  return pdfBuffer;
}

// Email sending endpoint
app.post("/sendEmail", async (req, res) => {
  const { to, subject, text, attachment } = req.body;

  // Configure nodemailer
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // use TLS
    auth: {
      user: "appjobs.cv@gmail.com",
      pass: "uzky bgic myiu ljnx",
    },
  });

  // Email options
  const mailOptions = {
    from: "appjobs.cv@gmail.com", // Replace with your Gmail email
    to,
    subject,
    text,
    attachments: [
      {
        filename: "UserProfile.pdf",
        content: attachment,
        encoding: "base64",
      },
    ],
  };

  try {
    // Send email
    await transporter.sendMail(mailOptions);
    res.status(200).send("Email sent successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending email");
  }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handlers
// print stacktrace on error
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.render("error", {
    message: err.message,
    error: err,
  });
});

app.listen(port, () =>
  console.log(`Demo App Client listening on port ${port}!`)
);
