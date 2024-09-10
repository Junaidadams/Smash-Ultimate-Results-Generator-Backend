const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "http://localhost:5173",
    // "http://192.168.1.39:5173",
  })
);

app.use(express.json());

app.post("/api/event-data", async (req, res) => {
  const { slug, page = 1, perPage = 8 } = req.body;
  const apiKey = process.env.START_GG_API_KEY;

  const eventIdQuery = `
    query getEventId($slug: String!) {
      event(slug: $slug) {
        id
        name
      }
    }
  `;

  const standingsQuery = `
    query EventStandings($eventId: ID!, $page: Int!, $perPage: Int!) {
      event(id: $eventId) {
        id
        name
        standings(query: {
          perPage: $perPage,
          page: $page
        }) {
          nodes {
            placement
            entrant {
              id
              name
              participants {
                id
                gamerTag
              }
            }
          }
        }
      }
    }
  `;

  try {
    // Step 1: Fetch event ID
    // console.log("Fetching event ID for slug:", slug);
    const eventIdResponse = await axios.post(
      `https://api.start.gg/gql/alpha`,
      { query: eventIdQuery, variables: { slug } },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const eventData = eventIdResponse.data.data.event;

    if (!eventData) {
      console.error("Event not found for slug:", slug);
      return res.status(404).json({ error: "Event not found" });
    }

    const eventId = eventData.id;

    // Step 2: Fetch standings

    const standingsResponse = await axios.post(
      `https://api.start.gg/gql/alpha`,
      { query: standingsQuery, variables: { eventId, page, perPage } },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const standingsData = standingsResponse.data.data.event.standings.nodes;

    // Step 3: Return standings without character data
    const enhancedStandings = standingsData.map((stand) => ({
      ...stand,
      entrant: {
        ...stand.entrant,
        participants: stand.entrant.participants.map((participant) => ({
          ...participant,
        })),
      },
    }));

    // Step 4: Send the data
    res.json({
      event: {
        ...eventData,
        standings: {
          nodes: enhancedStandings,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching event data:", error);
    res.status(500).json({ error: "Error fetching event data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
