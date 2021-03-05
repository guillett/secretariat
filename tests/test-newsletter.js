const nock = require('nock');
const rewire = require('rewire');
const chai = require('chai');
const sinon = require('sinon');

const config = require('../config');
const knex = require('../db');
const BetaGouv = require('../betagouv');
const app = require('../index');
const controllerUtils = require('../controllers/utils');
const utils = require('./utils');
const {
  createNewsletter,
} = require('../schedulers/newsletterScheduler');

const newsletterScheduler = rewire('../schedulers/newsletterScheduler');
const computeMessageReminder = newsletterScheduler.__get__('computeMessageReminder');
const newsletterReminder = newsletterScheduler.__get__('newsletterReminder');
const sendNewsletter = newsletterScheduler.__get__('sendNewsletter');
const mockNewsletters = [
  {
    year_week: '2020-52',
    validator: 'julien.dauphant',
    url: `${config.padURL}/45a5dsdsqsdada`,
    sent_at: new Date(),
  },
  {
    year_week: '2021-02',
    validator: 'julien.dauphant',
    url: `${config.padURL}/54564q5484saw`,
    sent_at: new Date(),
  },
  {
    year_week: '2021-03',
    validator: 'julien.dauphant',
    url: `${config.padURL}/5456dsadsahjww`,
    sent_at: new Date(),
  },
  {
    year_week: '2020-51',
    validator: 'julien.dauphant',
    url: `${config.padURL}/54564qwsajsghd4rhjww`,
    sent_at: new Date(),
  },
];

const mockNewsletter = {
  year_week: '2021-9',
  url: `${config.padURL}/rewir34984292342sad`,
};
const MOST_RECENT_NEWSLETTER_INDEX = 2;
describe('Newsletter', () => {
  describe('should get newsletter data for newsletter page', () => {
    beforeEach(async () => {
      await knex('newsletters').insert(mockNewsletters);
    });
    afterEach(async () => {
      await knex('newsletters').truncate();
    });

    it('should get previous newsletter and last newsletter', (done) => {
      chai.request(app)
        .get('/newsletters')
        .set('Cookie', `token=${utils.getJWT('membre.actif')}`)
        .end((err, res) => {
          res.text.should.include(`${config.padURL}/5456dsadsahjww`);
          const allNewsletterButMostRecentOne = mockNewsletters.filter(
            (n) => n.year_week !== mockNewsletters[MOST_RECENT_NEWSLETTER_INDEX].year_week,
          );
          allNewsletterButMostRecentOne.forEach((newsletter) => {
            res.text.should.include(controllerUtils
              .formatDateToReadableDateAndTimeFormat(newsletter.sent_at));
          });
          const weekYear = mockNewsletters[MOST_RECENT_NEWSLETTER_INDEX].year_week.split('-');
          res.text.should.include(`<h3>Infolettre de la semaine du ${controllerUtils.formatDateToFrenchTextReadableFormat(controllerUtils.getDateOfISOWeek(weekYear[1], weekYear[0]))}</h3>`);
          done();
        });
    });
  });

  describe('cronjob newsletter', () => {
    beforeEach((done) => {
      this.slack = sinon.spy(BetaGouv, 'sendInfoToSlack');
      done();
    });

    afterEach((done) => {
      this.slack.restore();
      done();
    });

    it('should create new note', async () => {
      const padHeadCall = nock(`${config.padURL}`).persist()
      .head(/.*/)
      .reply(200, {
        status: 'OK',
      }, {
        'set-cookie': '73dajkhs8934892jdshakldsja',
      });

      const padPostLoginCall = nock(`${config.padURL}`).persist()
      .post(/^.*login.*/)
      .reply(200, {}, {
        'set-cookie': '73dajkhs8934892jdshakldsja',
      });

      const padGetDownloadCall = nock(`${config.padURL}`)
      .get(/^.*\/download/)
      .reply(200, '# TITLE ### TEXT CONTENT');

      const padPostNewCall = nock(`${config.padURL}`)
      .post(/^.*new/)
      .reply(301, undefined, {
        Location:`${config.padURL}/i3472ndasda4545`,
      })
      .get('/i3472ndasda4545')
      .reply(200, '# TITLE ### TEXT CONTENT');

      const res = await createNewsletter(); // await newsletterScheduler.__get__('createNewsletter')();
      padHeadCall.isDone().should.be.true;
      padGetDownloadCall.isDone().should.be.true;
      padPostLoginCall.isDone().should.be.true;
      padPostNewCall.isDone().should.be.true;
      const newsletter = await knex('newsletters').select();
      newsletter[0].url.should.equal(`${config.padURL}/i3472ndasda4545`);
      const date = new Date();
      newsletter[0].year_week.should.equal(`${date.getFullYear()}-${controllerUtils.getWeekNumber(date)}`);
      await knex('newsletters').truncate();
    });

    it('should send remind on monday at 8am', async () => {
      await knex('newsletters').insert([mockNewsletter]);
      this.clock = sinon.useFakeTimers(new Date('2021-03-01T07:59:59+01:00'));
      await newsletterReminder('FIRST_REMINDER');
      this.slack.firstCall.args[0].should.equal(computeMessageReminder('FIRST_REMINDER', mockNewsletter));
      this.slack.restore();
      await knex('newsletters').truncate();
    });

    it('should send remind on thursday at 8am', async () => {
      await knex('newsletters').insert([mockNewsletter]);
      this.clock = sinon.useFakeTimers(new Date('2021-03-04T07:59:59+01:00'));
      await newsletterReminder('SECOND_REMINDER');
      this.slack.firstCall.args[0].should.equal(computeMessageReminder('SECOND_REMINDER', mockNewsletter));
      this.clock.restore();
      this.slack.restore();
      await knex('newsletters').truncate();
    });

    it('should send remind on thursday at 6pm', async () => {
      await knex('newsletters').insert([mockNewsletter]);
      this.clock = sinon.useFakeTimers(new Date('2021-03-04T17:59:59+01:00'));
      await newsletterReminder('THIRD_REMINDER');
      this.slack.firstCall.args[0].should.equal(computeMessageReminder('THIRD_REMINDER', mockNewsletter));
      this.clock.restore();
      this.slack.restore();
      await knex('newsletters').truncate();
    });

    it('should send remind on friday at 8am', async () => {
      this.clock = sinon.useFakeTimers(new Date('2021-03-05T07:59:59+01:00'));
      await newsletterReminder('THIRD_REMINDER');
      this.slack.notCalled.should.be.true;
      this.clock.restore();
      this.slack.restore();
    });

    it('should sendNewsletter if validated', async () => {
      const newsletterContent = '' // TODO : change with other values
      const padHeadCall = nock(`${config.padURL}`).persist()
      .head(/.*/)
      .reply(200, {
        status: 'OK',
      }, {
        'set-cookie': '73dajkhs8934892jdshakldsja',
      });

      const padPostLoginCall = nock(`${config.padURL}`).persist()
      .post(/^.*login.*/)
      .reply(200, {}, {
        'set-cookie': '73dajkhs8934892jdshakldsja',
      });

      const padGetDownloadCall = nock(`${config.padURL}`)
      .get(/^.*\/download/)
      .reply(200, newsletterContent);

      await knex('newsletters').insert([{
        ...mockNewsletter,
        validator: 'julien.dauphant',
      }]);
      const date = new Date('2021-03-05T07:59:59+01:00');
      const sendEmailStub = sinon.stub(controllerUtils, 'sendMail').returns(true);
      this.clock = sinon.useFakeTimers(date);
      await sendNewsletter();
      padHeadCall.isDone().should.be.true;
      padGetDownloadCall.isDone().should.be.true;
      padPostLoginCall.isDone().should.be.true;
      sendEmailStub.calledOnce.should.be.true;
      sendEmailStub.firstCall.args[1].should.equal(`Infolettre du ${controllerUtils.formatDateToFrenchTextReadableFormat(date)}`);
      sendEmailStub.firstCall.args[2].shoud.equal(newsletterContent);
      this.slack.notCalled.should.be.true;
      this.clock.restore();
      sendEmailStub.restore();
      this.slack.restore();
      await knex('newsletters').truncate();
    });

    it('should not sendNewsletter if not validated', async () => {
      const newsletterContent = ''; // TODO : change with other values
      const padHeadCall = nock(`${config.padURL}`).persist()
      .head(/.*/)
      .reply(200, {
        status: 'OK',
      }, {
        'set-cookie': '73dajkhs8934892jdshakldsja',
      });

      const padPostLoginCall = nock(`${config.padURL}`).persist()
      .post(/^.*login.*/)
      .reply(200, {}, {
        'set-cookie': '73dajkhs8934892jdshakldsja',
      });

      const padGetDownloadCall = nock(`${config.padURL}`)
      .get(/^.*\/download/)
      .reply(200, newsletterContent);

      await knex('newsletters').insert([{
        ...mockNewsletter,
      }]);
      const date = new Date('2021-03-05T07:59:59+01:00');
      const sendEmailStub = sinon.stub(controllerUtils, 'sendMail').returns(true);
      this.clock = sinon.useFakeTimers(date);
      await sendNewsletter();
      padHeadCall.isDone().should.be.false;
      padGetDownloadCall.isDone().should.be.false;
      padPostLoginCall.isDone().should.be.false;
      sendEmailStub.calledOnce.should.be.false;
      sendEmailStub.firstCall.args[1].should.equal(`Infolettre du ${controllerUtils.formatDateToFrenchTextReadableFormat(date)}`);
      sendEmailStub.firstCall.args[2].shoud.equal(newsletterContent);
      this.slack.notCalled.should.be.false;
      this.clock.restore();
      sendEmailStub.restore();
      this.slack.restore();
      await knex('newsletters').truncate();
    });
  });

  describe('slack url newsletter', () => {
    it('should validate newsletter', async (done) => {
      await knex('newsletters').insert([{
        ...mockNewsletter,
      }]);
      const date = new Date('2021-03-05T07:59:59+01:00');
      this.clock = sinon.useFakeTimers(date);
      chai.request(app)
        .post('/validateNewsletter', {
          text: 'validate',
          validator: 'paul',
        })
        .end(async (err, res) => {
          const newsletter = await knex('newsletters').where({ year_week: mockNewsletter.year_week }).first();
          newsletter.validator.shoud.be('paul');
          await knex('newsletters').truncate();
          this.clock.restore();
          this.slack.restore();
          done();
        });
    });
  });
});
