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

  const characterQuery = `
    query GetCharacter($participantId: ID!) {
      participant(id: $participantId) {
        id
        characters {
          id
          name
          images {
            icon
            displayImage
          }
        }
      }
    }
  `;

  try {
    // Step 1: Fetch event ID
    console.log("Fetching event ID for slug:", slug);
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
    console.log("Fetched event ID:", eventId);

    // Step 2: Fetch standings
    console.log("Fetching standings for event ID:", eventId);
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

    // Step 3: Fetch character data for each participant
    const characterRequests = standingsData.flatMap((stand) => {
      if (!stand.entrant || !stand.entrant.participants) {
        return [];
      }

      return stand.entrant.participants.map(async (participant) => {
        const participantId = participant.id;

        try {
          console.log(
            "Fetching character data for participant ID:",
            participantId
          );
          const characterResponse = await axios.post(
            `https://api.start.gg/gql/alpha`,
            { query: characterQuery, variables: { participantId } },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            }
          );

          console.log(
            `Character response for participant ${participantId}:`,
            characterResponse.data
          );

          const characters =
            characterResponse.data.data.participant.characters || [];
          return {
            participantId,
            characters:
              characters.length > 0
                ? characters
                : [{ id: 0, name: "", images: { icon: "", displayImage: "" } }],
          };
        } catch (error) {
          console.error(
            `Error fetching character data for participant ${participantId}:`,
            error
          );
          return {
            participantId,
            characters: [
              { id: 0, name: "", images: { icon: "", displayImage: "" } },
            ],
          };
        }
      });
    });

    const characterDataArray = await Promise.all(characterRequests);

    // Map character data back to standings
    const enhancedStandings = standingsData.map((stand) => {
      const updatedParticipants = stand.entrant.participants.map(
        (participant) => {
          const characterData = characterDataArray.find(
            (data) => data && data.participantId === participant.id
          );

          return {
            ...participant,
            characters: characterData
              ? characterData.characters
              : [{ id: 0, name: "", images: { icon: "", displayImage: "" } }],
          };
        }
      );

      return {
        ...stand,
        entrant: {
          ...stand.entrant,
          participants: updatedParticipants,
        },
      };
    });

    // Step 4: Send the combined data
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
