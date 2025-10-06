// Vercel Serverless Function
export default async function handler(req, res) {
  try {
    const r = await fetch('https://quan.suning.com/getSysTime.do');
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: 'fail' });
  }
}
