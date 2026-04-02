import { Fragment, type ReactNode } from "react";

type TicketInfoField = {
  label: string;
  value: ReactNode;
};

export function OrderTicketSection(props: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="order-ticket-section">
      <h3 className="order-ticket-section-title">{props.title}</h3>
      {props.children}
    </section>
  );
}

export function TicketInfoTable(props: {
  rows: TicketInfoField[];
  columns?: 1 | 2;
}) {
  const columns = props.columns ?? 2;
  const groupedRows: TicketInfoField[][] = [];

  for (let index = 0; index < props.rows.length; index += columns) {
    groupedRows.push(props.rows.slice(index, index + columns));
  }

  return (
    <table className="ticket-info-table">
      <tbody>
        {groupedRows.map((row, rowIndex) => (
          <tr key={`ticket-row-${rowIndex}`}>
            {row.map((field) => (
              <Fragment key={field.label}>
                <th>{field.label}</th>
                <td>{field.value}</td>
              </Fragment>
            ))}
            {row.length < columns ? (
              <Fragment>
                <th aria-hidden="true" />
                <td aria-hidden="true" />
              </Fragment>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
