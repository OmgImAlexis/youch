import { createServer } from 'http';
import { Youch } from '../dist/youch.js';

class HttpException extends Error {
  constructor (message, status) {
    super(message);
    this.status = status;
    this.name = this.constructor.name;
  }
}

const foo = () => {
  throw new HttpException('Some weird error', 503);
};

const renderErrorPage = async (error, request, response) => {
  try {
    const youch = new Youch(error, request);
    const html = await youch
      .addLink(({ message }) => {
        const url = `https://stackoverflow.com/search?q=${encodeURIComponent(`[adonis.js] ${message}`)}`
        return `<a href="${url}" target="_blank" title="Search on stackoverflow"><i class="fab fa-stack-overflow"></i>
        </a>`
      })
      .toHTML();

    response.writeHead(200, { 'content-type': 'text/html' })
    response.write(html)
    response.end();
  } catch (error) { 
    response.writeHead(500);
    console.log(error);
    response.write(error);
    response.end();
  }
};

createServer((request, response) => {
  try {
    foo();
  } catch (error) {
    renderErrorPage(error, request, response);
  }
}).listen(8000, () => {
  console.log('listening to port 8000')
});
