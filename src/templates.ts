export const INITIAL_SUBJECT =
  "Sponsor a World Championship-Qualifying Robotics Team";

export const FOLLOW_UP_SUBJECT =
  "Re: Sponsor a World Championship-Qualifying Robotics Team";

export function initialBody(
  businessName: string,
  senderName: string,
  senderContact: string,
): string {
  return `Hello ${businessName},

My name is Hamza Wadera, and I'm a 10th grader on the Penguin Empire Robotics Team at San Marin High School. I'm reaching out to ask if ${businessName} would consider sponsoring our team.

For nearly 20 years, we've competed in FIRST Robotics Competition (FRC), one of the most respected STEM programs in the world, drawing more than 3,400 high school teams across 30 countries, every year. Only a portion of teams qualify for the World Championship each season, a level our team has reached twice, most recently in 2022.

Our team receives no funding from our school. Annual costs, including competition fees, robot materials, and testing equipment, total over $25,000. We rely entirely on generous donors and sponsors like ${businessName} to make our season possible.

We offer a tiered sponsorship program with various benefits at every level, and we're happy to discuss other kinds of support too. I've attached our sponsorship packet and a few photos of our team and robot.

Any contribution helps!

Best,
${senderName}
${senderContact}`;
}

export function followUpBody(businessName: string, senderName: string): string {
  return `Hi ${businessName},

Just following up in case my note below got buried, we'd still love to have ${businessName} as a sponsor for our Robotics team this season. Happy to answer any questions or send more details.

Thank you for considering supporting us!

Best,
${senderName}`;
}
