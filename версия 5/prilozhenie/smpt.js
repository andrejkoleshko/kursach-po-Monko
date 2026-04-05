const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "smtp.yandex.ru",
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: "koleshko-andrey@ya.ru",
    pass: "dohwixtempykbtjx",
  },
});

transporter.sendMail({
  from: "koleshko-andrey@ya.ru",
  to: "koleshko-andrey@ya.ru",
  subject: "SMTP test",
  text: "Если ты видишь это письмо — SMTP работает",
})
.then(() => console.log("OK"))
.catch(err => console.error("ERR:", err));
