// checkpoints.js: the places to visit. Edit the text here; explore.js reads PLACES.
// x, y = position on the map as fractions (0-1) of the image. z = zoom when you arrive.
// Source for the science: NASA SVS 5669 (GEOS Aerosols, 19 August 2025).
const PLACES = [
  { n: "Hurricane Erin", x: .30, y: .35, z: 3, species: ["seasalt", "dust"],
    what: "The first Atlantic hurricane of the 2025 season spins here, pulling in dust from Africa.",
    why: "Its powerful winds churn the ocean and throw up sea salt, which shows as the blue spirals around the storm. Erin did not make landfall, but it brought heavy rain and tropical storm conditions to Puerto Rico, the Turks and Caicos, the Bahamas and the U.S. Atlantic coast.",
    listen: ["The sea salt pad (left) swells around the spiral.", "Move east along the violet band: the dust arpeggio (right) joins in, so you can hear the storm mixing with the dust it pulls in."] },
  { n: "Saharan dust journey", x: .50, y: .38, z: 2.6, species: ["dust"],
    what: "Dust from the Sahara travels all the way across the Atlantic Ocean.",
    why: "Winds carry the desert dust thousands of miles. It makes skies hazy in the Caribbean and affects air quality when it reaches the United States.",
    listen: ["The dust arpeggio (right) is fullest where the plume is thickest.", "Follow it west toward Erin and notice how the notes thin out."] },
  { n: "Spain wildfires", x: .49, y: .28, z: 3, species: ["smoke"],
    what: "Wildfires raged across several regions of Spain.",
    why: "Smoke particles rise and drift with the wind, so a fire can change air quality and visibility far from where it burns.",
    listen: ["Smoke is the deep bass pulse (low, near the centre). It is strongest right over the fires.", "Move east a little: Etna's bright bells appear above you."] },
  { n: "Southern Africa burning", x: .54, y: .53, z: 2.8, species: ["smoke"],
    what: "Seasonal agricultural burning sends smoke drifting out over the Atlantic Ocean.",
    why: "Fires set to burn farmland make smoke, and the winds carry it west over the sea.",
    listen: ["The bass pulse is loudest over the fires.", "Follow the smoke out over the water and listen for it fading as it spreads."] },
  { n: "Kilauea, Hawaii", x: .069, y: .392, z: 3.2, species: ["sulfate"],
    what: "Hawaii's Kilauea volcano released a narrow stream of sulfate particles moving west.",
    why: "Volcanoes release sulfur-rich emissions that become sulfate particles. The wind stretches them into a thin stream across the ocean.",
    listen: ["Sulfates are the bright bells above you.", "Notice how sparse they are here compared with busy regions like the Atlantic."] },
  { n: "Mount Etna, Italy", x: .542, y: .29, z: 3.2, species: ["sulfate"],
    what: "Italy's Mount Etna created similar sulfate streams over southern Europe.",
    why: "It is the same process as Kilauea: volcanic sulfur becomes sulfate particles that the wind spreads out.",
    listen: ["Listen for the bells above you, then compare them with Kilauea.", "Smoke from the Spanish fires, to the west, plays low underneath."] },
];
window.PLACES = PLACES;