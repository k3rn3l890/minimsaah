import { PrismaClient, Role, ContentStatus, ArticleCategory, VideoCategory } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Demo Users ───────────────────────────────────

  const password = await bcrypt.hash('admin123', 12);
  const writerPassword = await bcrypt.hash('writer123', 12);
  const subscriberPassword = await bcrypt.hash('subscriber123', 12);

  const owner = await prisma.user.upsert({
    where: { email: 'admin@minimsaah.com' },
    update: {},
    create: {
      email: 'admin@minimsaah.com',
      passwordHash: password,
      firstName: 'Kwame',
      lastName: 'Asante',
      role: Role.OWNER,
      bio: 'Founder and lead editor of MINIMSAAH. Sports journalist with 15+ years covering African football.',
    },
  });

  const editor = await prisma.user.upsert({
    where: { email: 'editor@minimsaah.com' },
    update: {},
    create: {
      email: 'editor@minimsaah.com',
      passwordHash: password,
      firstName: 'Ama',
      lastName: 'Mensah',
      role: Role.EDITOR,
      bio: 'Senior editor specializing in tactical analysis and match reports.',
    },
  });

  const journalist = await prisma.user.upsert({
    where: { email: 'writer@minimsaah.com' },
    update: {},
    create: {
      email: 'writer@minimsaah.com',
      passwordHash: writerPassword,
      firstName: 'Kofi',
      lastName: 'Boateng',
      role: Role.JOURNALIST,
      bio: 'Feature writer covering grassroots football development across West Africa.',
    },
  });

  const videographer = await prisma.user.upsert({
    where: { email: 'video@minimsaah.com' },
    update: {},
    create: {
      email: 'video@minimsaah.com',
      passwordHash: writerPassword,
      firstName: 'Yaa',
      lastName: 'Owusu',
      role: Role.VIDEOGRAPHER,
      bio: 'Documentary filmmaker capturing untold stories of African football.',
    },
  });

  const subscriber = await prisma.user.upsert({
    where: { email: 'fan@minimsaah.com' },
    update: {},
    create: {
      email: 'fan@minimsaah.com',
      passwordHash: subscriberPassword,
      firstName: 'Nana',
      lastName: 'Agyeman',
      role: Role.SUBSCRIBER,
    },
  });

  console.log('✅ Users created');

  // ─── Ticker Headlines ─────────────────────────────

  const tickerHeadlines = [
    { text: 'Ghana Black Stars secure dramatic 2-1 victory over Nigeria in World Cup qualifier', priority: 10, active: true },
    { text: 'Breaking: Asante Kotoko announce new head coach ahead of CAF Champions League campaign', priority: 9, active: true },
    { text: 'Transfer Alert: Hearts of Oak confirm interest in Brazilian midfielder', priority: 8, active: true },
    { text: 'Ghana Premier League matchday 15 results and standings update', priority: 7, active: true },
    { text: 'Exclusive: Kumasi Sports Academy receives $2M investment from FIFA Forward programme', priority: 6, active: true },
    { text: 'Live: WAFA U-17 squad named for COSAFA Youth Championship', priority: 5, active: true },
  ];

  for (const ticker of tickerHeadlines) {
    await prisma.ticker.create({ data: ticker });
  }
  console.log(`✅ ${tickerHeadlines.length} ticker headlines created`);

  // ─── Articles ──────────────────────────────────────

  const articles = [
    {
      title: 'The Hidden Gems of Accra: Grassroots Football academies Reshaping Ghana\'s Future',
      excerpt: 'Inside the community pitches and makeshift academies where Ghana\'s next generation of world-class talent is being forged — no funding, no fame, just raw passion.',
      body: `In the dusty compounds of Jamestown and the narrow streets of Nima, young footballers chase a dream with nothing but a ball and boundless determination.\n\nThese grassroots academies operate without the glamour of Europe's elite youth systems. There are no manicured pitches, no physiotherapists, no video analysis rooms. Yet they produce players who go on to compete at the highest levels.\n\n"We don't have resources, but we have heart," says Coach Emmanuel Darko, who runs the Osu Youth Development Programme from a converted parking lot. "Every child who walks through our gates gets the same chance — rich or poor, tall or short."\n\nThe numbers speak for themselves. Over the past decade, more than 40 Ghanaian players who came through grassroots systems have signed professional contracts abroad. That's not counting the dozens who've become key figures in the Ghana Premier League.\n\nThe real challenge, according to scouts who've visited these programmes, isn't finding talent — it's nurturing it. Without consistent funding, many academies close their doors within two years. Those that survive do so through community donations and the sheer will of their founders.`,
      category: 'FEATURE' as ArticleCategory,
      authorId: journalist.id,
      readingTime: 8,
      featured: true,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['grassroots', 'academy', 'ghana', 'talent'],
    },
    {
      title: 'Match Report: Hearts of Oak 3-1 Asante Kotoko — A Derby Day Classic',
      excerpt: 'A hat-trick from junior striker Kwesi Afriyie sealed a memorable victory for Hearts of Oak in the biggest fixture of the Ghana Premier League season.',
      body: `Hearts of Oak produced a masterclass performance at the Accra Sports Stadium, defeating rivals Asante Kotoko 3-1 in front of a sellout crowd.\n\nKwesi Afriyie opened the scoring in the 12th minute with a curling shot from outside the box that left goalkeeper Ibrahim Danlad rooted to the spot. The striker doubled his tally before halftime, latching onto a defence-splitting pass from captain Fatawu Mohammed.\n\nKotoko pulled one back through Steven Mukwala's header just after the break, temporarily shifting the momentum. But Afriyie completed his hat-trick in the 71st minute, meeting a corner kick at the near post to send the stadium into delirium.\n\nThe victory moves Hearts of Oak to within two points of league leaders Samartex, with a game in hand.`,
      category: 'MATCH_REPORT' as ArticleCategory,
      authorId: editor.id,
      readingTime: 5,
      featured: false,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['match-report', 'hearts', 'kotoko', 'derby'],
    },
    {
      title: 'Tactical Analysis: Why Ghana\'s New 3-5-2 Formation Could Be the Answer',
      excerpt: 'Coach Otto Addo\'s decision to switch to a back three could unlock the potential of Ghana\'s wing-backs and finally solve the midfield creativity problem.',
      body: `When Otto Addo unveiled a 3-5-2 formation in the recent friendly against Liberia, few paid much attention. It was, after all, just a test match.\n\nBut looking deeper, the tactical shift could be transformative for the Black Stars. The system maximizes the qualities of wing-backs Gideon Mensah and Tariq Lamptey while providing midfield solidity through Thomas Partey's advanced positioning.\n\n"The beauty of the 3-5-2 is that it creates numerical superiority in midfield while still maintaining width," explains tactical analyst Nii Armah. "With Partey and Kudus operating in the half-spaces, you have two players who can receive between the lines and drive forward."\n\nThe formation also addresses Ghana's persistent vulnerability to counter-attacks. With three centre-backs and two holding midfielders, the defensive structure provides natural cover that the previous 4-2-3-1 lacked.`,
      category: 'ANALYSIS' as ArticleCategory,
      authorId: journalist.id,
      readingTime: 6,
      featured: false,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['analysis', 'tactics', 'black-stars', 'formation'],
    },
    {
      title: 'In Conversation with Andre Ayew: Legacy, Leadership, and the Road Ahead',
      excerpt: 'The Ghana captain opens up about his journey, the weight of the armband, and his plans for the next World Cup cycle.',
      body: `"People see the goals and the celebrations," says Andre Ayew, settling into a chair at the Ghana Football Association headquarters in Accra. "They don't see the 5 AM training sessions when nobody's watching."\n\nAt 35, Ayew remains one of the most influential figures in Ghanaian football. His career has spanned Olympique de Marseille, Swansea City, Al Sadd, and now a return to the Ghana Premier League with Hearts of Oak.\n\n"Coming home was the best decision I've made," he says with a smile. "I want to give back what this country gave me."\n\nAyew's leadership extends beyond the pitch. Through the Ayew Foundation, he's funded the construction of three football pitches in Accra and sponsored 50 young players' education.\n\n"Football opens doors, but education keeps them open," he says. "Every child in my academy goes to school. That's non-negotiable."`,
      category: 'INTERVIEW' as ArticleCategory,
      authorId: journalist.id,
      readingTime: 10,
      featured: false,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['interview', 'ayew', 'leadership', 'legacy'],
    },
    {
      title: 'The Case for Investment: Why African Football\'s Economic Moment Is Now',
      excerpt: 'With broadcasting rights, sponsorships, and transfer fees skyrocketing, African football is at an inflection point. Those who invest now will reap the rewards.',
      body: `The numbers are staggering. The African football market has grown by 240% in the past five years, driven by broadcasting deals, digital platforms, and a new generation of commercially savvy club administrators.\n\nThe English Premier League alone pays over £1.2 billion annually for rights across the African continent. Add in La Liga, Serie A, and the Bundesliga, and you're looking at a broadcasting ecosystem worth more than $2 billion.\n\nBut here's the real story: the talent export market. African players now command transfer fees that would have been unthinkable a decade ago. Victor Osimhen's €70 million move to Napoli, Nicolas Pépé's €72 million to Arsenal — these aren't outliers anymore. They're the new baseline.\n\n"Every European scout is now looking at Africa," says investment banker and football consultant Kweku Asante. "The question isn't whether to invest — it's how quickly you can move."`,
      category: 'OPINION' as ArticleCategory,
      authorId: editor.id,
      readingTime: 7,
      featured: false,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['opinion', 'investment', 'business', 'economics'],
    },
  ];

  for (const article of articles) {
    const slug = slugify(article.title);
    await prisma.article.create({
      data: {
        ...article,
        slug,
        publishedAt: new Date(),
      },
    });
  }
  console.log(`✅ ${articles.length} articles created`);

  // ─── Videos ────────────────────────────────────────

  const videos = [
    {
      title: 'Kwesi Afriyie\'s Hat-Trick Highlights — Hearts vs Kotoko',
      description: 'All three goals from the youngster\'s stunning performance in the Accra derby.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      duration: 312,
      category: 'HIGHLIGHT' as VideoCategory,
      authorId: videographer.id,
      featured: true,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['highlights', 'derby', 'hat-trick'],
    },
    {
      title: 'Training Ground: Inside the Black Stars Camp',
      description: 'Exclusive behind-the-scenes access to the Ghana national team\'s preparation for the World Cup qualifier.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      duration: 486,
      category: 'BEHIND_SCENES' as VideoCategory,
      authorId: videographer.id,
      featured: false,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['behind-the-scenes', 'national-team', 'training'],
    },
    {
      title: 'Scouting Report: 15-Year-Old Midfielder Kofi Mensah',
      description: 'Our scouts break down the tape on Ghana\'s most exciting young prospect.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      duration: 624,
      category: 'INTERVIEW' as VideoCategory,
      authorId: videographer.id,
      featured: false,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['scouting', 'youth', 'prospect'],
    },
  ];

  for (const video of videos) {
    const slug = slugify(video.title);
    await prisma.video.create({
      data: {
        ...video,
        slug,
        publishedAt: new Date(),
      },
    });
  }
  console.log(`✅ ${videos.length} videos created`);

  // ─── Documentaries ─────────────────────────────────

  const documentaries = [
    {
      title: 'The Pitch Beyond: Grassroots Football in Rural Ghana',
      description: 'A 45-minute journey into the heartland of Ghanaian football, where village pitches produce national team stars.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      duration: 2700,
      authorId: videographer.id,
      featured: true,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['documentary', 'grassroots', 'rural'],
    },
    {
      title: 'Kotoko vs Hearts: 50 Years of Rivalry',
      description: 'The definitive documentary on West Africa\'s greatest football rivalry, featuring rare archive footage and exclusive interviews.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      duration: 3600,
      authorId: videographer.id,
      featured: false,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['documentary', 'rivalry', 'history'],
    },
    {
      title: 'Women\'s Game: Rising Voices in Ghanaian Football',
      description: 'Three women fighting to transform the landscape of women\'s football in Ghana through coaching, administration, and grassroots development.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      duration: 2400,
      authorId: videographer.id,
      featured: false,
      status: 'PUBLISHED' as ContentStatus,
      tags: ['documentary', 'womens-football', 'empowerment'],
    },
  ];

  for (const doc of documentaries) {
    const slug = slugify(doc.title);
    await prisma.documentary.create({
      data: {
        ...doc,
        slug,
        publishedAt: new Date(),
      },
    });
  }
  console.log(`✅ ${documentaries.length} documentaries created`);

  // ─── Events ────────────────────────────────────────

  const events = [
    {
      title: 'Accra Sports Journalism Awards 2026',
      description: 'The annual celebration of excellence in Ghanaian sports journalism. Categories include Feature Writing, Photography, and Broadcast.',
      date: new Date('2026-09-15T18:00:00Z'),
      location: 'Accra',
      venue: 'Kempinski Hotel Gold Coast City',
      tags: ['awards', 'journalism', 'gala'],
      authorId: owner.id,
      status: 'PUBLISHED' as ContentStatus,
    },
    {
      title: 'MINIMSAAH Grassroots Football Summit',
      description: 'A two-day conference bringing together coaches, scouts, and football administrators to discuss the future of youth development in West Africa.',
      date: new Date('2026-10-22T09:00:00Z'),
      endDate: new Date('2026-10-23T17:00:00Z'),
      location: 'Kumasi',
      venue: 'Kumasi Cultural Centre',
      tags: ['summit', 'grassroots', 'development'],
      authorId: owner.id,
      status: 'PUBLISHED' as ContentStatus,
    },
    {
      title: 'Live: Ghana vs Morocco — World Cup Qualifier Watch Party',
      description: 'Join MINIMSAAH for a live screening of the crucial World Cup qualifier at our Accra office. Expert analysis, half-time breakdowns, and post-match reactions.',
      date: new Date('2026-11-10T20:00:00Z'),
      location: 'Accra',
      venue: 'MINIMSAAH HQ, East Legon',
      tags: ['watch-party', 'live', 'world-cup'],
      authorId: owner.id,
      status: 'PUBLISHED' as ContentStatus,
    },
  ];

  for (const event of events) {
    const slug = slugify(event.title);
    await prisma.event.create({
      data: {
        ...event,
        slug,
      },
    });
  }
  console.log(`✅ ${events.length} events created`);

  console.log('\n🎉 Seed complete! Full database populated:');
  console.log('   👤 5 users (OWNER, EDITOR, JOURNALIST, VIDEOGRAPHER, SUBSCRIBER)');
  console.log(`   📰 ${articles.length} articles`);
  console.log(`   🎥 ${videos.length} videos`);
  console.log(`   🎬 ${documentaries.length} documentaries`);
  console.log(`   📅 ${events.length} events`);
  console.log(`   📢 ${tickerHeadlines.length} ticker headlines`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
