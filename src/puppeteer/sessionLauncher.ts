import puppeteer, { Browser, Page, ElementHandle } from "puppeteer";
import { v4 as uuidv4 } from "uuid";

export async function launchWhatsAppSession(): Promise<{
  sessionId: string;
  browser: Browser;
  page: Page;
  qrCode: string;
}> {
  const sessionId = uuidv4();
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

  // QR code selector
  const qrCodeSelector =
    "#app > div > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.x1nhvcw1.xdt5ytf.x1dr59a3.xw2csxc.x1odjw0f.xyinxu5.xp48ta0.x1g2khh7.xtssl2i.xp9ttsr.x6s0dn4.x9f619.xdounpk.x1hql6x6.xe4h88v.x1g96xxu.x1t470q2 > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xgpatz3.xeuugli.x2lwn1j.xl56j7k.xdt5ytf.x6s0dn4 > div:nth-child(2) > div > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xe93d63.xeuugli.x2lwn1j.x1nhvcw1.xdt5ytf.x1cy8zhl > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xeuugli.x2lwn1j.x1nhvcw1.x1q0g3np.x1cy8zhl.xkh2ocl.x6s0dn4.x1qughib.xi32cqo.x1qgv0r9.x18t01z2.xr3inr3 > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xeuugli.x2lwn1j.xl56j7k.xdt5ytf.x6s0dn4.x1n2onr6.x1y8v6su.x1eq81zi > div > div > canvas";

  // Attempt to find QR code canvas with timeout
  let canvas: ElementHandle<Element> | null = null;
  try {
    await page.waitForSelector(qrCodeSelector, { timeout: 30000 });
    canvas = await page.$(qrCodeSelector);
    if (!canvas) {
      console.log("QR code canvas not found, capturing available content");
    }
  } catch (error) {
    console.log(
      "QR code canvas not immediately available, proceeding to capture"
    );
  }

  // Extract QR code as data URL (fallback to screenshot if canvas not found)
  let qrCode: string;
  if (canvas) {
    qrCode = await canvas.evaluate((el) => {
      const dataUrl = (el as HTMLCanvasElement).toDataURL("image/png");
      console.log("QR code extracted:", dataUrl.substring(0, 50) + "..."); // Debug log
      return dataUrl;
    });
  } else {
    // Fallback: Capture the QR code area as a screenshot
    const qrArea = await page.$(
      "#app > div > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.x1nhvcw1.xdt5ytf.x1dr59a3.xw2csxc.x1odjw0f.xyinxu5.xp48ta0.x1g2khh7.xtssl2i.xp9ttsr.x6s0dn4.x9f619.xdounpk.x1hql6x6.xe4h88v.x1g96xxu.x1t470q2 > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xgpatz3.xeuugli.x2lwn1j.xl56j7k.xdt5ytf.x6s0dn4"
    );
    if (qrArea) {
      qrCode = await qrArea.screenshot({ encoding: "base64", type: "png" });
      qrCode = `data:image/png;base64,${qrCode}`;
      console.log(
        "QR code screenshot captured:",
        qrCode.substring(0, 50) + "..."
      );
    } else {
      await browser.close();
      throw new Error("Failed to capture QR code area");
    }
  }

  return { sessionId, browser, page, qrCode };
}

export async function refreshWhatsAppPage(page: Page): Promise<string> {
  await page.reload({ waitUntil: "networkidle2" });

  const qrCodeSelector =
    "#app > div > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.x1nhvcw1.xdt5ytf.x1dr59a3.xw2csxc.x1odjw0f.xyinxu5.xp48ta0.x1g2khh7.xtssl2i.xp9ttsr.x6s0dn4.x9f619.xdounpk.x1hql6x6.xe4h88v.x1g96xxu.x1t470q2 > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xgpatz3.xeuugli.x2lwn1j.xl56j7k.xdt5ytf.x6s0dn4 > div:nth-child(2) > div > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xe93d63.xeuugli.x2lwn1j.x1nhvcw1.xdt5ytf.x1cy8zhl > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xeuugli.x2lwn1j.x1nhvcw1.x1q0g3np.x1cy8zhl.xkh2ocl.x6s0dn4.x1qughib.xi32cqo.x1qgv0r9.x18t01z2.xr3inr3 > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xeuugli.x2lwn1j.xl56j7k.xdt5ytf.x6s0dn4.x1n2onr6.x1y8v6su.x1eq81zi > div > div > canvas";

  let canvas: ElementHandle<Element> | null = null;
  try {
    await page.waitForSelector(qrCodeSelector, { timeout: 30000 });
    canvas = await page.$(qrCodeSelector);
  } catch (error) {
    console.log("QR code canvas not found on refresh, capturing screenshot");
  }

  let qrCode: string;
  if (canvas) {
    qrCode = await canvas.evaluate((el) => {
      const dataUrl = (el as HTMLCanvasElement).toDataURL("image/png");
      console.log(
        "Refreshed QR code extracted:",
        dataUrl.substring(0, 50) + "..."
      );
      return dataUrl;
    });
  } else {
    const qrArea = await page.$(
      "#app > div > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.x1nhvcw1.xdt5ytf.x1dr59a3.xw2csxc.x1odjw0f.xyinxu5.xp48ta0.x1g2khh7.xtssl2i.xp9ttsr.x6s0dn4.x9f619.xdounpk.x1hql6x6.xe4h88v.x1g96xxu.x1t470q2 > div.x1c4vz4f.xs83m0k.xdl72j9.x1g77sc7.x78zum5.xozqiw3.x1oa3qoh.x12fk4p8.xgpatz3.xeuugli.x2lwn1j.xl56j7k.xdt5ytf.x6s0dn4"
    );
    if (qrArea) {
      qrCode = await qrArea.screenshot({ encoding: "base64", type: "png" });
      qrCode = `data:image/png;base64,${qrCode}`;
      console.log(
        "Refreshed QR code screenshot captured:",
        qrCode.substring(0, 50) + "..."
      );
    } else {
      throw new Error("Failed to capture refreshed QR code area");
    }
  }

  return qrCode;
}
