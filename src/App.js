import "./App.css";
import "semantic-ui-css/semantic.min.css";

import React, { useState, useEffect } from "react";
import {
  Container,
  Header,
  Image,
  Segment,
  Icon,
  List,
  Message,
} from "semantic-ui-react";
import StackedVaccinationPlot from "./components/StackedVaccinationPlot";
import VaccinationProgressPlot from "./components/VaccinationProgressPlot";
import DailyRatesPlot from "./components/DailyRatesPlot";
import GenericContainer from "./components/GenericContainer";
import ScoreCardGroupWithDebt from "./components/ScoreCardGroupWithDebt";
import ScoreCardGroup from "./components/ScoreCardGroup";

import VaccineStatisticsCompact from "./components/VaccineStatisticsCompact";
import SecondDoseDebt from "./components/SecondDoseDebt";

import logo from "./assets/logo.png";
import vaccination_json from "./data/vaccination-data.json";
import moment from "moment";
import { computeAverageRate, convertToWeeklyData } from "./utils/compute_utils";
import PredictedTimeline from "./components/PredictedTimeline";

function App() {
  const [parsedData, setParsedData] = useState(null);
  const [updateDate, setUpdateDate] = useState(null);
  const [debtData, setDebtData] = useState(null);
  const [weeklyDebtData, setWeeklyDebtData] = useState(null);
  const [rateForPredictions, setRateForPredictions] = useState(null);

  // Load, convert, and sort data
  useEffect(() => {
    let rawData = vaccination_json.data;

    // Sort by date (newer first)
    rawData.sort(function (a, b) {
      return new Date(a.date) - new Date(b.date);
    });

    let parsedData = computeAverageRate(
      rawData,
      7,
      "newPeopleVaccinatedFirstDoseByPublishDate",
      "sevenDaysRate"
    );
    parsedData = computeAverageRate(
      parsedData,
      7,
      "newPeopleVaccinatedSecondDoseByPublishDate",
      "sevenDaysRateSecond"
    );

    setParsedData(parsedData);

    // Compute update date (assumed to be latest date in data + 1 day)
    const latestDate = parsedData[parsedData.length - 1].date;
    setUpdateDate(moment(latestDate).add(1, "d").format("DD MMMM YYYY"));
  }, []);

  useEffect(() => {
    if (parsedData) {
      const RATE =
        parsedData[parsedData.length - 1].sevenDaysRate +
        parsedData[parsedData.length - 1].sevenDaysRateSecond;
      const debtData_ = {};

      const startDate = moment(parsedData[parsedData.length - 1].date).add(
        1,
        "days"
      );

      for (let i = 0; i < 240; i++) {
        debtData_[moment(startDate).add(i, "days").format("YYYY-MM-DD")] = {
          date: moment(startDate).add(i, "days").format("YYYY-MM-DD"),
          secondDosesDone: 0,
          firstDosesDone: 0,
          secondDosesCarryOverFromPreviousDay: 0,
          secondDosesNewFromDay: 0,
          spareCapacity: 0,
          secondDosesDue: 0,
          cumFirstDoses: 0,
          cumSecondDoses: 0,
          week: moment(moment(startDate).add(i, "days")).week(),
        };
      }

      let keys = Object.keys(debtData_);
      const endDate = keys[keys.length - 1];

      // Project initial data forward
      parsedData.map((datum) => {
        let targetDate = moment(datum["date"])
          .add(12, "weeks")
          .format("YYYY-MM-DD");

        debtData_[targetDate].secondDosesDue +=
          datum.newPeopleVaccinatedFirstDoseByPublishDate;
      });

      let carryOver = 0;
      let cumFirstDoses =
        parsedData[parsedData.length - 1]
          .cumPeopleVaccinatedFirstDoseByPublishDate;
      let cumSecondDoses =
        parsedData[parsedData.length - 1]
          .cumPeopleVaccinatedSecondDoseByPublishDate;

      const maxDoses = 53000000;
      const allDosesRate = RATE;

      setRateForPredictions(allDosesRate);

      Object.entries(debtData_).forEach((entry) => {
        const [key, value] = entry;

        let secondDosesDue = value.secondDosesDue + carryOver;

        let secondDosesDone = 0;
        let firstDosesDone = 0;

        // If all first doses done --> prioritize second doses
        if (cumFirstDoses >= maxDoses && cumSecondDoses <= maxDoses) {
          secondDosesDone = allDosesRate;
        } else if (cumSecondDoses <= maxDoses) {
          // If more doses due that the rate
          // --> second doses done are equal to the rate
          if (secondDosesDue > allDosesRate) {
            secondDosesDone = allDosesRate;
          } else {
            secondDosesDone = secondDosesDue;
          }
        }

        carryOver = Math.max(secondDosesDue - secondDosesDone, 0);

        let spareCapacity = Math.max(allDosesRate - secondDosesDone, 0);

        if (spareCapacity > 0 && cumFirstDoses <= maxDoses) {
          firstDosesDone = spareCapacity;

          let targetDate = moment(value.date)
            .add(12, "weeks")
            .format("YYYY-MM-DD");

          if (targetDate in debtData_)
            debtData_[targetDate].secondDosesDue += firstDosesDone;
          else console.log(targetDate);
        }

        cumFirstDoses = cumFirstDoses + firstDosesDone;
        cumSecondDoses = cumSecondDoses + secondDosesDone;

        value.firstDosesDone = firstDosesDone;
        value.secondDosesDone = secondDosesDone;
        value.cumFirstDoses = cumFirstDoses;
        value.cumSecondDoses = cumSecondDoses;
      });

      const debtDataToPlot = [];

      for (const [key, value] of Object.entries(debtData_)) {
        debtDataToPlot.push(value);
      }

      setDebtData(debtDataToPlot);
      setWeeklyDebtData(convertToWeeklyData(debtDataToPlot));
    }
  }, [parsedData]);

  return (
    <div className="App">
      <Container>
        <Header as="h1" textAlign="center">
          <Image src={logo} circular bordered />
          <Header.Content>Vaccine Tracker UK</Header.Content>
          <Header.Subheader>
            Visualisations to make sense of UK's COVID vaccine rollout
          </Header.Subheader>
        </Header>
        <Message info>
          <Message.Header>Last Updated: {updateDate}</Message.Header>
          <p>
            This website is updated daily around 4pm BST (if delayed, check our{" "}
            <a href="https://twitter.com/VaccineStatusUK">
              Twitter <Icon name="twitter" />
              account
            </a>{" "}
            for more information)
          </p>
        </Message>
        <Segment raised size="large">
          <Header as="h2" dividing>
            <Icon name="question circle" />
            <Header.Content>
              About
              <Header.Subheader>
                What is this website? What is it for?
              </Header.Subheader>
            </Header.Content>
          </Header>
          <Segment basic size="large">
            The aim of this website is to provide up-to-date visualisations to
            help better understand the progress of the UK's COVID vaccine
            rollout programme.
            <br />
            <List bulleted size="medium">
              <List.Item>
                This website is best viewed on a desktop, though we are doing
                our best to make it work as well as possible on mobile devices.
              </List.Item>
              <List.Item>
                Data kindly provided by{" "}
                <a href="https://coronavirus.data.gov.uk/">
                  Public Health England
                </a>{" "}
                (thank you for your hard work! 🤗)
              </List.Item>
              <List.Item>
                We provide daily updates on{" "}
                <a href="https://twitter.com/VaccineStatusUK">
                  Twitter <Icon name="twitter" />
                </a>
              </List.Item>
              <List.Item>
                We build in the open, check out our{" "}
                <a href="https://github.com/nicjac/vaccine-tracker-uk">
                  Github
                  <Icon name="github" />
                  repository!
                </a>
              </List.Item>
            </List>
          </Segment>
        </Segment>

        <PredictedTimeline parsedData={parsedData} debtData={debtData} />

        <Header as={"h2"}>
          <Header.Content>📊 Data Analysis and Visualisations</Header.Content>
          <Header.Subheader>
            Data exploration, statistics, and visualisations solely based on
            historical data. No predictions or projections involved.
          </Header.Subheader>
        </Header>
        <GenericContainer
          ChildComponent={<VaccineStatisticsCompact parsedData={parsedData} />}
          title="Rollout Dashboard"
          description="Key numbers related to the vaccination programme."
          dateUpdated={updateDate}
        />
        <GenericContainer
          ChildComponent={<VaccinationProgressPlot parsedData={parsedData} />}
          title="Rollout Tracker"
          description="Breakdown of the overall COVID vaccine rollout in the UK for 1st and 2nd doses."
          dateUpdated={updateDate}
        />
        <GenericContainer
          ChildComponent={<DailyRatesPlot parsedData={parsedData} />}
          title="Daily Vaccination Rates"
          description="Daily vaccination rates for 1st and 2nd doses since 11 January 2021. Dashed contours indicate weekend days."
          dateUpdated={updateDate}
        />
        <Header as={"h2"}>
          <Header.Content>🔮 Projections and Predictions</Header.Content>
          <Header.Subheader>
            Projections and predictions using various models and statistical
            techniques. Those figures and visualisations are indicative only,
            and are always subject to change when new data becomes available.
          </Header.Subheader>
        </Header>
        <GenericContainer
          ChildComponent={
            <ScoreCardGroupWithDebt
              parsedData={parsedData}
              debtData={debtData}
            />
          }
          title="Government Target Scorecard"
          description="Keeping track of the government targets. The dates and number of individuals are based on the UK COVID-19 Delivery Plan and the explainer by the Institute For Government. These predictions take into account the impact of the second doses debt. It is assumed that the rate is constant (equal to the last 7-day average for 1st and 2nd doses).
          A strict 12-week delay is introduced between 1st and 2nd doses. 2nd doses always take priority."
          dateUpdated={updateDate}
        />
        <GenericContainer
          ChildComponent={
            <SecondDoseDebt
              parsedData={parsedData}
              debtData={debtData}
              weeklyDebtData={weeklyDebtData}
              rateForPredictions={rateForPredictions}
            />
          }
          title="Projected Timeline"
          description="Projected timeline taking into account the second doses debt. A strict 12-week delay is introduced between 1st and 2nd doses until all 1st doses are administered, after which 2nd doses are done as soon as possible regardless of the delay. 2nd doses always take priority."
          dateUpdated={updateDate}
        />

        {/* <GenericContainer
          ChildComponent={<ScoreCardGroup parsedData={parsedData} />}
          title="Government Target Scorecard"
          description="Keeping track of the government targets. The dates and number of individuals are based on the UK COVID-19 Delivery Plan and the explainer by the Institute For Government. Prediction based on a 7-day vaccination rate average. The bar plots show deviation from target over time."
          dateUpdated={updateDate}
        /> */}

        {/* <GenericContainer
          ChildComponent={<StackedVaccinationPlot parsedData={parsedData} />}
          title="Cumulative Doses Administered Over Time"
          description="Cumulative first and second doses administered since 11 January
          2021."
          dateUpdated={updateDate}
        /> */}
      </Container>
    </div>
  );
}

export default App;
