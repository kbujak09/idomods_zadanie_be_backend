const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

const app = express();

app.use(cors());

app.use(bodyParser.json());

let data = [];

const url = 'https://zooart6.yourtechnicaldomain.com/api/admin/v4/orders/orders/get';
const options = {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    'X-API-KEY': 'YXBwbGljYXRpb24xNjpYeHI1K0MrNVRaOXBaY2lEcnpiQzBETUZROUxrRzFFYXZuMkx2L0RHRXZRdXNkcmF5R0Y3ZnhDMW1nejlmVmZP'
  },
  body: JSON.stringify({params: {ordersStatuses: ['finished']}})
};

async function fetchData() {
  try {
    const res = await fetch(url, options);
    const json = await res.json();

    if (json.errors) {
      return data = {
        error: {
          message: json.errors.faultString
        }
      }
    }

    for (let item of json.Results) {
      if (item.orderDetails.productsResults.length !== 0) {
        data.push({
          orderId: item.orderId,
          products: item.orderDetails.productsResults.map((product) => {
            return {
              'productId': product.productId,
              'quantity': product.productQuantity
            }
          }),
          orderWorth: item.orderDetails.productsResults.reduce((total, product) => {
            return total + (product.productOrderPriceBaseCurrency * product.productQuantity)
          }, 0)
        });
      };
    }

  } 
  catch (err) {
    console.error(err);
  }
}

const generateCsvData = (orders) => {
  const header = 'orderId,productId,quantity,orderWorth\n';
  const rows = orders.flatMap(order => 
    order.products.map(product => 
      `${order.orderId},${product.productId},${product.quantity},${order.orderWorth}`
    )
  ).join('\n');
  return header + rows;
};

fetchData();  

cron.schedule('0 9 * * *', () => {
  fetchData();
}, {
  timezone: "Europe/Warsaw"
})

const user = {
  login: 'admin',
  password: '1234'
};

const SECRET_KEY = 'hash';

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  };
};

app.post('/auth', (req, res) => {
  const { login, password } = req.body

  if (login === user.login && password === user.password) {
    const token = jwt.sign({ login }, SECRET_KEY);
    res.json({ token: token });
  } 
  else {
    res.status(401).json({ message: 'Invalid login or password.'});
  }
});


app.get('/orders', authenticateJWT,(req, res) => {
  if (data.error) {
    res.status(500).json({error: data.error.message});
  }
  else {
    res.json(data);
  }
});

app.get('/orders/csv', authenticateJWT, (req, res) => {
  const {minWorth, maxWorth, sort} = req.query;

  let sorted = [...data];

  if (minWorth) {
    sorted = sorted.filter(item => item.orderWorth >= +minWorth);
  }

  if (maxWorth) {
    sorted = sorted.filter(item => item.orderWorth <= +maxWorth);
  }

  switch (sort) {
    case 'id_asc':
      sorted.sort((a, b) => a.orderId.localeCompare(b.orderId));
      break;    
    case 'id_des':
      sorted.sort((a, b) => b.orderId.localeCompare(a.orderId));
      break;
    case 'quan_asc':
      sorted.sort((a, b) => a.products.length - b.products.length);
      break;
    case 'quan_des':
      sorted.sort((a, b) => b.products.length - a.products.length);
      break;
    case 'worth_asc':
      sorted.sort((a, b) => a.orderWorth - b.orderWorth);
      break;
    case 'worth_des':
      sorted.sort((a, b) => b.orderWorth - a.orderWorth);
      break;
    default:
      break;
  }

  const csvData = generateCsvData(sorted);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(csvData);
});

app.get('/orders/:orderId/csv', authenticateJWT, (req, res) => {
  const order = data.find(item => item.orderId === req.params.orderId);

  if (!order) {
    return res.status(404).send('Order not found');
  }

  const csvData = generateCsvData([order]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="order_${order.orderId}.csv"`);
  res.send(csvData);
});

app.listen(5000, () => {
  console.log('App listening on port 5000!');
});